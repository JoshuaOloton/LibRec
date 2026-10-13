import { prisma } from "@/server/db";
import { noteRating } from "@/server/services/recommender-cache";

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export class InvalidRatingError extends Error {
  constructor() {
    super(`A rating is a whole number from ${MIN_RATING} to ${MAX_RATING}.`);
  }
}

/**
 * FR3: record a borrow. One BORROW per patron and book (unique index), so borrowing again keeps the
 * original row and timestamp.
 */
export async function recordBorrow(userId: number, bookId: number) {
  return prisma.interaction.upsert({
    where: { userId_bookId_type: { userId, bookId, type: "BORROW" } },
    create: { userId, bookId, type: "BORROW" },
    update: {},
  });
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
  return {
    borrowed: rows.some((r) => r.type === "BORROW"),
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
