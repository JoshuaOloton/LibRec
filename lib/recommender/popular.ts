import { topN } from "./ranking";
import type { HistoryItem, Recommender, ScoredItem } from "./types";

/**
 * Sanity-check baseline: the books most patrons interacted with, the same list for everyone (minus what the patron
 * already has). It is NOT one of the configurations in the hypothesis.
 */
export class PopularRecommender implements Recommender {
  readonly name = "popular";

  /** @param popularity bookId -> number of distinct patrons who interacted with the book in training */
  constructor(private readonly popularity: Map<number, number>) {}

  recommend(history: HistoryItem[], n: number): ScoredItem[] {
    const seen = new Set(history.map((h) => h.bookId));
    const scores = new Map<number, number>();
    for (const [bookId, count] of this.popularity) if (!seen.has(bookId)) scores.set(bookId, count);
    return topN(scores, n);
  }
}
