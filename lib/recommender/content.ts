import { topN } from "./ranking";
import { tokenise } from "./text";
import { fit, transform, type SparseVector, type TfidfModel } from "./tfidf";
import type { HistoryItem, Recommender, ScoredItem } from "./types";

export interface ContentOptions {
  /** Profile weight of a book the patron only borrowed (a real rating uses its own value, 1-5). */
  borrowWeight: number;
}

export const DEFAULT_CONTENT_OPTIONS: ContentOptions = { borrowWeight: 3.5 };

/** Fit TF-IDF over the catalogue text and return one sparse vector per book. */
export function buildItemVectors(books: { id: number; contentText: string }[]): {
  model: TfidfModel;
  vectors: Map<number, SparseVector>;
} {
  const tokens = books.map((b) => tokenise(b.contentText));
  const model = fit(tokens);
  return { model, vectors: new Map(books.map((b, i) => [b.id, transform(tokens[i], model)])) };
}

interface IndexedItem {
  terms: Int32Array;
  weights: Float64Array;
  norm: number;
}

/**
 * Content-based filtering (Score A). The patron profile is the rating-weighted mean of the TF-IDF vectors of the
 * books they interacted with; a candidate's score is the cosine similarity between that profile and its vector.
 */
export class ContentRecommender implements Recommender {
  readonly name = "content";
  private readonly items = new Map<number, IndexedItem>();
  private readonly dim: number;

  constructor(
    vectors: Map<number, SparseVector>,
    private readonly options: ContentOptions = DEFAULT_CONTENT_OPTIONS,
  ) {
    let dim = 0;
    for (const [bookId, vec] of vectors) {
      const keys = Object.keys(vec).map(Number);
      const terms = Int32Array.from(keys);
      const weights = Float64Array.from(keys, (k) => vec[k]);
      let sumSq = 0;
      for (const w of weights) sumSq += w * w;
      for (const k of keys) dim = Math.max(dim, k + 1);
      this.items.set(bookId, { terms, weights, norm: Math.sqrt(sumSq) });
    }
    this.dim = dim;
  }

  /** Weighted mean of the patron's book vectors, or null when none of their books has a usable vector. */
  profile(history: HistoryItem[]): { vector: Float64Array; norm: number } | null {
    const vector = new Float64Array(this.dim);
    let totalWeight = 0;
    for (const h of history) {
      const item = this.items.get(h.bookId);
      if (!item) continue;
      const weight = h.ratingValue ?? this.options.borrowWeight;
      totalWeight += weight;
      for (let i = 0; i < item.terms.length; i++) vector[item.terms[i]] += weight * item.weights[i];
    }
    if (totalWeight <= 0) return null;
    let sumSq = 0;
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= totalWeight;
      sumSq += vector[i] * vector[i];
    }
    return sumSq > 0 ? { vector, norm: Math.sqrt(sumSq) } : null;
  }

  /** Cosine score for every book the patron has not interacted with. Empty when there is no usable profile. */
  score(history: HistoryItem[]): Map<number, number> {
    const scores = new Map<number, number>();
    const profile = this.profile(history);
    if (!profile) return scores;
    const seen = new Set(history.map((h) => h.bookId));
    for (const [bookId, item] of this.items) {
      if (seen.has(bookId)) continue;
      let dot = 0;
      for (let i = 0; i < item.terms.length; i++) dot += profile.vector[item.terms[i]] * item.weights[i];
      scores.set(bookId, item.norm === 0 ? 0 : dot / (item.norm * profile.norm));
    }
    return scores;
  }

  recommend(history: HistoryItem[], n: number): ScoredItem[] {
    return topN(this.score(history), n);
  }
}
