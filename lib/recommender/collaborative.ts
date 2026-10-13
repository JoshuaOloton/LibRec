import { topN } from "./ranking";
import type { HistoryItem, RecommendContext, Recommender, ScoredItem } from "./types";

export interface CollaborativeOptions {
  /** Fewest co-rated books for a similarity to count. */
  minOverlap: number;
  /** Number of positive-similarity neighbours kept. */
  k: number;
}

export const DEFAULT_COLLABORATIVE_OPTIONS: CollaborativeOptions = { minOverlap: 3, k: 30 };

/** One explicit (real) rating. Borrows never enter collaborative filtering (DECISIONS 2026-10-13). */
export interface Rating {
  userId: number;
  bookId: number;
  ratingValue: number;
}

export interface Neighbour {
  userId: number;
  similarity: number;
  overlap: number;
}

interface Rater {
  userId: number;
  rating: number;
}

/**
 * Pearson correlation over co-rated books, from the running sums n, Σx, Σy, Σx², Σy², Σxy.
 * Returns null when it is undefined (fewer than 2 books, or no variance on either side).
 */
export function pearson(n: number, sx: number, sy: number, sxx: number, syy: number, sxy: number): number | null {
  const vx = n * sxx - sx * sx;
  const vy = n * syy - sy * sy;
  if (n < 2 || vx <= 0 || vy <= 0) return null;
  return (n * sxy - sx * sy) / Math.sqrt(vx * vy);
}

/**
 * User-user collaborative filtering (Score B). Similarity is Pearson over the books both patrons rated; the k most
 * similar positively-correlated patrons predict a rating for each book they rated:
 *   pred(u,i) = mean_u + sum sim(u,v) * (r_vi - mean_v) / sum |sim(u,v)|
 * An inverted index (book -> raters) means only patrons who share a book with the target are ever touched.
 */
export class CollaborativeRecommender implements Recommender {
  readonly name = "collaborative";
  private readonly byBook = new Map<number, Rater[]>();
  private readonly userMean = new Map<number, number>();

  constructor(
    ratings: Rating[],
    private readonly options: CollaborativeOptions = DEFAULT_COLLABORATIVE_OPTIONS,
  ) {
    // One rating per (user, book); the last one wins.
    const perUser = new Map<number, Map<number, number>>();
    for (const r of ratings) {
      let books = perUser.get(r.userId);
      if (!books) perUser.set(r.userId, (books = new Map()));
      books.set(r.bookId, r.ratingValue);
    }
    for (const [userId, books] of perUser) {
      let sum = 0;
      for (const [bookId, rating] of books) {
        sum += rating;
        let list = this.byBook.get(bookId);
        if (!list) this.byBook.set(bookId, (list = []));
        list.push({ userId, rating });
      }
      this.userMean.set(userId, sum / books.size);
    }
  }

  /** The patron's explicit ratings, keyed by book. */
  private static explicitRatings(history: HistoryItem[]): Map<number, number> {
    const out = new Map<number, number>();
    for (const h of history) if (h.ratingValue !== null) out.set(h.bookId, h.ratingValue);
    return out;
  }

  /** Top-k positively correlated patrons with at least `minOverlap` co-rated books, most similar first. */
  neighbours(history: HistoryItem[], context: RecommendContext = {}): Neighbour[] {
    return this.findNeighbours(CollaborativeRecommender.explicitRatings(history), context.userId);
  }

  private findNeighbours(own: Map<number, number>, selfId: number | undefined): Neighbour[] {
    const acc = new Map<number, [n: number, sx: number, sy: number, sxx: number, syy: number, sxy: number]>();
    for (const [bookId, x] of own) {
      for (const { userId, rating: y } of this.byBook.get(bookId) ?? []) {
        if (userId === selfId) continue;
        let a = acc.get(userId);
        if (!a) acc.set(userId, (a = [0, 0, 0, 0, 0, 0]));
        a[0] += 1;
        a[1] += x;
        a[2] += y;
        a[3] += x * x;
        a[4] += y * y;
        a[5] += x * y;
      }
    }
    const found: Neighbour[] = [];
    for (const [userId, a] of acc) {
      if (a[0] < this.options.minOverlap) continue;
      const sim = pearson(a[0], a[1], a[2], a[3], a[4], a[5]);
      if (sim !== null && sim > 0) found.push({ userId, similarity: sim, overlap: a[0] });
    }
    found.sort((p, q) => q.similarity - p.similarity || p.userId - q.userId);
    return found.slice(0, this.options.k);
  }

  /** Predicted rating for every book a neighbour rated that the patron has not interacted with. */
  score(history: HistoryItem[], context: RecommendContext = {}): Map<number, number> {
    const own = CollaborativeRecommender.explicitRatings(history);
    const scores = new Map<number, number>();
    if (own.size === 0) return scores;
    const neighbours = this.findNeighbours(own, context.userId);
    if (neighbours.length === 0) return scores;

    let ownSum = 0;
    for (const r of own.values()) ownSum += r;
    const ownMean = ownSum / own.size;

    const seen = new Set(history.map((h) => h.bookId));
    const num = new Map<number, number>();
    const den = new Map<number, number>();
    const sims = new Map(neighbours.map((nb) => [nb.userId, nb.similarity]));
    // Walk the index once per candidate book; only neighbours' ratings contribute.
    for (const [bookId, raters] of this.byBook) {
      if (seen.has(bookId)) continue;
      for (const { userId, rating } of raters) {
        const sim = sims.get(userId);
        if (sim === undefined) continue;
        num.set(bookId, (num.get(bookId) ?? 0) + sim * (rating - this.userMean.get(userId)!));
        den.set(bookId, (den.get(bookId) ?? 0) + Math.abs(sim));
      }
    }
    for (const [bookId, d] of den) scores.set(bookId, ownMean + num.get(bookId)! / d);
    return scores;
  }

  recommend(history: HistoryItem[], n: number, context: RecommendContext = {}): ScoredItem[] {
    return topN(this.score(history, context), n);
  }
}
