/** One distinct book in a patron's history. */
export interface HistoryItem {
  bookId: number;
  /** Real rating 1-5, or null when the patron only borrowed the book. */
  ratingValue: number | null;
}

export interface ScoredItem {
  bookId: number;
  score: number;
}

export interface RecommendContext {
  /** The patron asking. Collaborative filtering uses it to keep the patron out of their own neighbourhood. */
  userId?: number;
}

/** Common interface for every configuration (content, collaborative, hybrid, baselines). */
export interface Recommender {
  readonly name: string;
  /** Top-n books the patron has not already interacted with, best first. */
  recommend(history: HistoryItem[], n: number, context?: RecommendContext): ScoredItem[];
}
