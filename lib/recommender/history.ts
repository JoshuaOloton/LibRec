import type { HistoryItem } from "./types";

export interface RawInteraction {
  bookId: number;
  type: "BORROW" | "RATE";
  ratingValue: number | null;
}

/**
 * Collapse a patron's interaction rows to one entry per distinct book.
 * A real rating wins over a borrow of the same book; the output is sorted by book id.
 */
export function buildHistory(rows: RawInteraction[]): HistoryItem[] {
  const byBook = new Map<number, number | null>();
  for (const r of rows) {
    const rating = r.type === "RATE" ? r.ratingValue : null;
    const seen = byBook.get(r.bookId);
    if (seen === undefined || (seen === null && rating !== null)) byBook.set(r.bookId, rating);
  }
  return [...byBook].map(([bookId, ratingValue]) => ({ bookId, ratingValue })).sort((a, b) => a.bookId - b.bookId);
}
