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

/** A dense weighted-mean vector over the vocabulary, with its length. */
export interface ContentProfile {
  vector: Float64Array;
  norm: number;
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
  profile(history: HistoryItem[]): ContentProfile | null {
    return this.weightedProfile(history.map((h) => ({ bookId: h.bookId, weight: h.ratingValue ?? this.options.borrowWeight })));
  }

  /** Weighted mean of the given books' vectors (weights need not sum to 1), or null when there is no usable vector. */
  weightedProfile(entries: { bookId: number; weight: number }[]): ContentProfile | null {
    const vector = new Float64Array(this.dim);
    let totalWeight = 0;
    for (const { bookId, weight } of entries) {
      const item = this.items.get(bookId);
      if (!item) continue;
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

  /**
   * The centroid of the books in each group, with every group counting equally however many books it holds
   * (used for genre onboarding: one group per picked genre).
   */
  groupCentroid(groups: number[][]): ContentProfile | null {
    return this.weightedProfile(groups.flatMap((ids) => ids.map((bookId) => ({ bookId, weight: 1 / ids.length }))));
  }

  /** Cosine of a profile against every book except those in `exclude`. */
  scoreProfile(profile: ContentProfile, exclude: ReadonlySet<number> = new Set()): Map<number, number> {
    const scores = new Map<number, number>();
    for (const [bookId, item] of this.items) {
      if (exclude.has(bookId)) continue;
      let dot = 0;
      for (let i = 0; i < item.terms.length; i++) dot += profile.vector[item.terms[i]] * item.weights[i];
      scores.set(bookId, item.norm === 0 ? 0 : dot / (item.norm * profile.norm));
    }
    return scores;
  }

  /** Cosine score for every book the patron has not interacted with. Empty when there is no usable profile. */
  score(history: HistoryItem[]): Map<number, number> {
    const profile = this.profile(history);
    if (!profile) return new Map();
    return this.scoreProfile(profile, new Set(history.map((h) => h.bookId)));
  }

  /** The books closest to one book (itself excluded), best first. */
  similarTo(bookId: number, n: number): ScoredItem[] {
    const profile = this.weightedProfile([{ bookId, weight: 1 }]);
    if (!profile) return [];
    return topN(this.scoreProfile(profile, new Set([bookId])), n);
  }

  /** Cosine between two books' vectors; 0 when either is unknown or empty. */
  similarity(a: number, b: number): number {
    const x = this.items.get(a);
    const y = this.items.get(b);
    if (!x || !y || x.norm === 0 || y.norm === 0) return 0;
    // Term indices are ascending, so a two-pointer merge finds the shared terms.
    let dot = 0;
    for (let i = 0, j = 0; i < x.terms.length && j < y.terms.length; ) {
      if (x.terms[i] === y.terms[j]) dot += x.weights[i++] * y.weights[j++];
      else if (x.terms[i] < y.terms[j]) i++;
      else j++;
    }
    return dot / (x.norm * y.norm);
  }

  /** Which of the patron's own books is closest to the candidate (ties to the lower book id), for the "why". */
  mostSimilarOwn(candidateId: number, ownBookIds: number[]): { bookId: number; similarity: number } | null {
    let best: { bookId: number; similarity: number } | null = null;
    for (const bookId of [...ownBookIds].sort((p, q) => p - q)) {
      const similarity = this.similarity(candidateId, bookId);
      if (!best || similarity > best.similarity) best = { bookId, similarity };
    }
    return best;
  }

  recommend(history: HistoryItem[], n: number): ScoredItem[] {
    return topN(this.score(history), n);
  }
}
