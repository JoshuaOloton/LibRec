import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  getInteractionState,
  InvalidRatingError,
  listUserInteractions,
  recordBorrow,
  recordRating,
} from "@/server/services/interactions";
import { createPatron, resetDb, seedFixtureBooks } from "./helpers";

let userId: number;
let bookA: number;
let bookB: number;

beforeEach(async () => {
  await resetDb();
  const books = await seedFixtureBooks();
  [bookA, bookB] = [books[0].id, books[1].id];
  userId = (await createPatron()).id;
});

describe("TC04 interaction recording (FR3)", () => {
  it("writes a BORROW row and a RATE row with the correct type and a timestamp", async () => {
    const before = Date.now();
    await recordBorrow(userId, bookA);
    await recordRating(userId, bookB, 4);
    const after = Date.now();

    const rows = await prisma.interaction.findMany({ where: { userId }, orderBy: { id: "asc" } });
    expect(rows).toHaveLength(2);

    const [borrow, rate] = rows;
    expect(borrow).toMatchObject({ bookId: bookA, type: "BORROW", ratingValue: null, simulated: false });
    expect(rate).toMatchObject({ bookId: bookB, type: "RATE", ratingValue: 4, simulated: false });
    for (const r of rows) {
      expect(r.timestamp.getTime()).toBeGreaterThanOrEqual(before - 1000); // allow DB/app clock skew
      expect(r.timestamp.getTime()).toBeLessThanOrEqual(after + 1000);
    }
  });

  it("updates a re-rating instead of adding a second row", async () => {
    await recordRating(userId, bookA, 2);
    const first = await prisma.interaction.findFirstOrThrow({ where: { userId, bookId: bookA } });

    await new Promise((r) => setTimeout(r, 20));
    await recordRating(userId, bookA, 5);

    const rows = await prisma.interaction.findMany({ where: { userId, bookId: bookA, type: "RATE" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].ratingValue).toBe(5);
    expect(rows[0].timestamp.getTime()).toBeGreaterThan(first.timestamp.getTime());
  });

  it("keeps one BORROW when a book is borrowed twice, with the original timestamp", async () => {
    const first = await recordBorrow(userId, bookA);
    await new Promise((r) => setTimeout(r, 20));
    const second = await recordBorrow(userId, bookA);

    expect(second.id).toBe(first.id);
    expect(second.timestamp.getTime()).toBe(first.timestamp.getTime());
    expect(await prisma.interaction.count({ where: { userId, bookId: bookA, type: "BORROW" } })).toBe(1);
  });

  it("lets a patron borrow and rate the same book as separate interactions", async () => {
    await recordBorrow(userId, bookA);
    await recordRating(userId, bookA, 3);
    expect(await prisma.interaction.count({ where: { userId, bookId: bookA } })).toBe(2);
  });

  it("keeps patrons separate: another patron's rating is a different row", async () => {
    const other = await createPatron("other@example.com");
    await recordRating(userId, bookA, 5);
    await recordRating(other.id, bookA, 1);
    expect(await prisma.interaction.count({ where: { bookId: bookA, type: "RATE" } })).toBe(2);
  });

  it.each([0, 6, 3.5, -1, Number.NaN])("rejects the rating %s and writes nothing", async (value) => {
    await expect(recordRating(userId, bookA, value)).rejects.toBeInstanceOf(InvalidRatingError);
    expect(await prisma.interaction.count()).toBe(0);
  });

  it("accepts every rating from 1 to 5", async () => {
    for (const value of [1, 2, 3, 4, 5]) {
      await recordRating(userId, bookA, value);
      expect((await getInteractionState(userId, bookA)).rating).toBe(value);
    }
  });

  it("reports what a patron has done with a book", async () => {
    expect(await getInteractionState(userId, bookA)).toEqual({ borrowed: false, rating: 0 });
    await recordBorrow(userId, bookA);
    await recordRating(userId, bookA, 4);
    expect(await getInteractionState(userId, bookA)).toEqual({ borrowed: true, rating: 4 });
  });

  it("lists a patron's shelf with one entry per book, preferring the rating", async () => {
    await recordBorrow(userId, bookA);
    await recordRating(userId, bookA, 4);
    await recordBorrow(userId, bookB);

    const shelf = await listUserInteractions(userId);
    expect(shelf).toHaveLength(2);
    expect(shelf.find((r) => r.bookId === bookA)).toMatchObject({ type: "RATE", ratingValue: 4 });
    expect(shelf.find((r) => r.bookId === bookB)).toMatchObject({ type: "BORROW" });
  });

  it("removes a patron's interactions with the book when the book is deleted", async () => {
    await recordRating(userId, bookA, 5);
    await prisma.book.delete({ where: { id: bookA } });
    expect(await prisma.interaction.count({ where: { bookId: bookA } })).toBe(0);
  });
});
