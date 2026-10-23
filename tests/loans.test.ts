import { beforeEach, describe, expect, it } from "vitest";
import {
  addDays,
  canRenew,
  computeDueAt,
  daysOverdue,
  lateFee,
  lateFeePerDay,
  loanStatus,
  maxRenewals,
  renewalDays,
} from "@/lib/loans";
import { prisma } from "@/server/db";
import {
  getInteractionState,
  listLoans,
  LoanError,
  recordBorrow,
  renewLoan,
  returnBook,
} from "@/server/services/interactions";
import { loadHistory } from "@/server/services/recommendations";
import { createPatron, resetDb, seedFixtureBooks } from "./helpers";

const NOW = new Date("2026-10-23T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("loan rules (lib/loans)", () => {
  it("sets the due date a whole number of days after the borrow", () => {
    expect(computeDueAt(NOW, 14).toISOString()).toBe("2026-11-06T10:00:00.000Z");
  });

  it("is not overdue on the due date itself, and one hour late counts as one day", () => {
    const due = new Date(NOW.getTime() + 7 * DAY);
    expect(daysOverdue(due, due)).toBe(0);
    expect(daysOverdue(due, new Date(due.getTime() + 60 * 60 * 1000))).toBe(1);
    expect(daysOverdue(due, new Date(due.getTime() + 3 * DAY))).toBe(3);
  });

  it("charges the daily fee only for late days, and stops at the return date", () => {
    const due = new Date(NOW.getTime() - 3 * DAY);
    expect(lateFee(due, NOW)).toBe(3 * lateFeePerDay);
    expect(lateFee(due, NOW, new Date(due.getTime() + DAY))).toBe(lateFeePerDay);
    expect(lateFee(new Date(NOW.getTime() + DAY), NOW)).toBe(0);
  });

  it("reports the status of a loan", () => {
    const at = (days: number) => ({ dueAt: new Date(NOW.getTime() + days * DAY), returnedAt: null });
    expect(loanStatus(at(10), NOW)).toBe("ON_LOAN");
    expect(loanStatus(at(2), NOW)).toBe("DUE_SOON");
    expect(loanStatus(at(-1), NOW)).toBe("OVERDUE");
    expect(loanStatus({ ...at(-1), returnedAt: NOW }, NOW)).toBe("RETURNED");
  });

  it("allows one renewal, and none once overdue or returned", () => {
    const loan = { dueAt: addDays(NOW, 3), returnedAt: null, renewals: 0 };
    expect(canRenew(loan, NOW)).toBe(true);
    expect(canRenew({ ...loan, renewals: maxRenewals }, NOW)).toBe(false);
    expect(canRenew({ ...loan, dueAt: addDays(NOW, -1) }, NOW)).toBe(false);
    expect(canRenew({ ...loan, returnedAt: NOW }, NOW)).toBe(false);
  });
});

describe("loans (borrow, return, renew)", () => {
  let userId: number;
  let bookA: number;
  let bookB: number;

  beforeEach(async () => {
    await resetDb();
    const books = await seedFixtureBooks();
    [bookA, bookB] = [books[0].id, books[1].id];
    userId = (await createPatron()).id;
  });

  it("sets the due date from the chosen period and rejects any other period", async () => {
    const loan = await recordBorrow(userId, bookA, 21, NOW);
    expect(loan.dueAt?.toISOString()).toBe(addDays(NOW, 21).toISOString());
    await expect(recordBorrow(userId, bookB, 10, NOW)).rejects.toBeInstanceOf(LoanError);
    expect(await prisma.interaction.count({ where: { bookId: bookB } })).toBe(0);
  });

  it("returns a book, and lets it be borrowed again on the same row with a fresh loan", async () => {
    const first = await recordBorrow(userId, bookA, 7, NOW);
    await renewLoan(userId, bookA, NOW);
    await returnBook(userId, bookA, addDays(NOW, 2));
    expect((await getInteractionState(userId, bookA)).onLoan).toBe(false);

    const again = await recordBorrow(userId, bookA, 14, addDays(NOW, 5));
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ returnedAt: null, renewals: 0 });
    expect(again.dueAt?.toISOString()).toBe(addDays(NOW, 19).toISOString());
    expect(await prisma.interaction.count({ where: { userId, bookId: bookA, type: "BORROW" } })).toBe(1);
  });

  it("keeps the original loan when a book already on loan is borrowed again", async () => {
    const first = await recordBorrow(userId, bookA, 7, NOW);
    const second = await recordBorrow(userId, bookA, 21, addDays(NOW, 1));
    expect(second.dueAt?.getTime()).toBe(first.dueAt?.getTime());
  });

  it("renews once, by the renewal period, then refuses", async () => {
    await recordBorrow(userId, bookA, 7, NOW);
    const renewed = await renewLoan(userId, bookA, addDays(NOW, 1));
    expect(renewed.renewals).toBe(1);
    expect(renewed.dueAt?.toISOString()).toBe(addDays(NOW, 7 + renewalDays).toISOString());
    await expect(renewLoan(userId, bookA, addDays(NOW, 2))).rejects.toThrow(/already been renewed/);
  });

  it("refuses to renew an overdue loan, and refuses to return or renew a book that is not out", async () => {
    await recordBorrow(userId, bookA, 7, NOW);
    await expect(renewLoan(userId, bookA, addDays(NOW, 8))).rejects.toThrow(/overdue/);
    await expect(returnBook(userId, bookB)).rejects.toBeInstanceOf(LoanError);
    await expect(renewLoan(userId, bookB)).rejects.toBeInstanceOf(LoanError);
  });

  it("lists active loans by due date, then returned loans, and leaves out simulated borrows", async () => {
    await prisma.interaction.create({ data: { userId, bookId: bookB, type: "BORROW", simulated: true } });
    await recordBorrow(userId, bookA, 14, NOW);
    const { active, returned } = await listLoans(userId, addDays(NOW, 15));
    expect(returned).toHaveLength(0);
    expect(active.map((l) => l.bookId)).toEqual([bookA]);
    expect(active[0]).toMatchObject({ status: "OVERDUE", lateFee: lateFeePerDay });

    await returnBook(userId, bookA, addDays(NOW, 16));
    const after = await listLoans(userId, addDays(NOW, 17));
    expect(after.active).toHaveLength(0);
    expect(after.returned[0]).toMatchObject({ bookId: bookA, lateFee: 2 * lateFeePerDay });
  });

  it("lets a patron borrow a book that only has a simulated dataset borrow", async () => {
    await prisma.interaction.create({ data: { userId, bookId: bookA, type: "BORROW", simulated: true } });
    expect((await getInteractionState(userId, bookA)).onLoan).toBe(false);
    const loan = await recordBorrow(userId, bookA, 7, NOW);
    expect(loan).toMatchObject({ simulated: false });
    expect((await getInteractionState(userId, bookA)).onLoan).toBe(true);
  });

  it("still counts a returned book in the patron's recommendation history", async () => {
    await recordBorrow(userId, bookA, 7, NOW);
    await returnBook(userId, bookA, addDays(NOW, 1));
    const history = await loadHistory(userId);
    expect(history.map((h) => h.bookId)).toContain(bookA);
  });
});
