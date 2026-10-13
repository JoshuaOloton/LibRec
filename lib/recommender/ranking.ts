import type { ScoredItem } from "./types";

/** Highest scores first; ties broken by ascending book id so results are reproducible. */
export function topN(scores: Map<number, number>, n: number): ScoredItem[] {
  return [...scores]
    .map(([bookId, score]) => ({ bookId, score }))
    .sort((a, b) => b.score - a.score || a.bookId - b.bookId)
    .slice(0, n);
}
