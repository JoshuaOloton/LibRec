import {
  addDays,
  canRenew,
  computeDueAt,
  daysLeft,
  defaultLoanDays,
  isLoanPeriod,
  lateFee,
  loanPeriodOptions,
  loanStatus,
  maxRenewals,
  renewalDays,
} from "@/lib/loans";
import { prisma } from "@/server/db";
import { noteRating } from "@/server/services/recommender-cache";

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export class InvalidRatingError extends Error {
  constructor() {
    super(`A rating is a whole number from ${MIN_RATING} to ${MAX_RATING}.`);
  }
}

export class LoanError extends Error {}

/** A loan the patron has out right now: made in the app (not simulated) and not yet returned. */
function isActiveLoan(row: { simulated: boolean; returnedAt: Date | null; dueAt: Date | null }) {
  return !row.simulated && !row.returnedAt && row.dueAt !== null;
}

/**
 * FR3: record a borrow. One BORROW per patron and book (unique index), so the loan lives on that one row:
 * borrowing a book that is already out keeps the original row, and borrowing again after a return (or over a
 * simulated dataset borrow) starts a fresh loan on the same row.
 */
export async function recordBorrow(userId: number, bookId: number, days: number = defaultLoanDays, now = new Date()) {
  if (!isLoanPeriod(days)) throw new LoanError(`A loan lasts ${loanPeriodOptions.join(", ")} days.`);
  const where = { userId_bookId_type: { userId, bookId, type: "BORROW" as const } };
  const existing = await prisma.interaction.findUnique({ where });
  if (existing && isActiveLoan(existing)) return existing;
  const loan = { timestamp: now, dueAt: computeDueAt(now, days), returnedAt: null, renewals: 0, simulated: false };
  return prisma.interaction.upsert({ where, create: { userId, bookId, type: "BORROW", ...loan }, update: loan });
}

/** Mark the patron's current loan of a book as returned. The row stays, so the borrow still counts as history. */
export async function returnBook(userId: number, bookId: number, now = new Date()) {
  const where = { userId_bookId_type: { userId, bookId, type: "BORROW" as const } };
  const loan = await prisma.interaction.findUnique({ where });
  if (!loan || !isActiveLoan(loan)) throw new LoanError("You don’t have this book on loan.");
  return prisma.interaction.update({ where, data: { returnedAt: now } });
}

/** Extend a loan by `renewalDays`, once, and only before it is overdue. */
export async function renewLoan(userId: number, bookId: number, now = new Date()) {
  const where = { userId_bookId_type: { userId, bookId, type: "BORROW" as const } };
  const loan = await prisma.interaction.findUnique({ where });
  if (!loan || !isActiveLoan(loan)) throw new LoanError("You don’t have this book on loan.");
  if (!canRenew(loan, now)) {
    throw new LoanError(
      loan.renewals >= maxRenewals
        ? "This loan has already been renewed."
        : "An overdue loan can’t be renewed. Please return the book.",
    );
  }
  return prisma.interaction.update({
    where,
    data: { dueAt: addDays(loan.dueAt!, renewalDays), renewals: { increment: 1 } },
  });
}

/** The patron's loans made in the app, with status and any late fee. Simulated borrows are left out. */
export async function listLoans(userId: number, now = new Date()) {
  const rows = await prisma.interaction.findMany({
    where: { userId, type: "BORROW", simulated: false, dueAt: { not: null } },
    include: { book: { select: { id: true, title: true, author: true, genres: true, coverUrl: true } } },
  });
  const loans = rows.map((r) => ({
    bookId: r.bookId,
    book: r.book,
    borrowedAt: r.timestamp,
    dueAt: r.dueAt!,
    returnedAt: r.returnedAt,
    renewals: r.renewals,
    status: loanStatus(r, now),
    daysLeft: daysLeft(r.dueAt!, now),
    lateFee: lateFee(r.dueAt!, now, r.returnedAt),
    canRenew: canRenew(r, now),
  }));
  const active = loans.filter((l) => !l.returnedAt).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const returned = loans.filter((l) => l.returnedAt).sort((a, b) => b.returnedAt!.getTime() - a.returnedAt!.getTime());
  return { active, returned };
}

/** FR3: record a rating. Re-rating updates the existing row (value and timestamp) instead of adding one. */
export async function recordRating(userId: number, bookId: number, value: number) {
  if (!Number.isInteger(value) || value < MIN_RATING || value > MAX_RATING) throw new InvalidRatingError();
  const row = await prisma.interaction.upsert({
    where: { userId_bookId_type: { userId, bookId, type: "RATE" } },
    create: { userId, bookId, type: "RATE", ratingValue: value },
    update: { ratingValue: value, timestamp: new Date() },
  });
  noteRating(userId, bookId, value); // keep the live collaborative index current (no refit)
  return row;
}

/** What this patron has already done with a book, for the detail page buttons. */
export async function getInteractionState(userId: number, bookId: number) {
  const rows = await prisma.interaction.findMany({ where: { userId, bookId } });
  const borrow = rows.find((r) => r.type === "BORROW");
  return {
    borrowed: !!borrow,
    onLoan: !!borrow && isActiveLoan(borrow),
    dueAt: borrow && isActiveLoan(borrow) ? borrow.dueAt : null,
    rating: rows.find((r) => r.type === "RATE")?.ratingValue ?? 0,
  };
}

/** A patron's history, newest first (placeholder Your shelf). */
export async function listUserInteractions(userId: number) {
  const rows = await prisma.interaction.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    include: { book: { select: { id: true, title: true, author: true, genres: true, coverUrl: true } } },
  });
  // One entry per book: the rating if there is one, otherwise the borrow.
  const byBook = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    const seen = byBook.get(r.bookId);
    if (!seen || (r.type === "RATE" && seen.type === "BORROW")) byBook.set(r.bookId, r);
  }
  return [...byBook.values()];
}
