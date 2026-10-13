import { clampScale, minMax, RATING_MAX, RATING_MIN } from "./normalise";
import { topN } from "./ranking";
import type { HistoryItem, RecommendContext, Recommender, ScoredItem } from "./types";

/** What the hybrid needs from a component: raw scores for every book the patron has not interacted with. */
export interface Scorer {
  score(history: HistoryItem[], context?: RecommendContext): Map<number, number>;
}

export interface HybridOptions {
  contentWeight: number;
  collabWeight: number;
  /** A patron with fewer distinct books than this is served by content only; CF is not invoked. */
  coldStartThreshold: number;
  /** Default list length when `recommend` is called without `n`. */
  topN: number;
}

/** The weights are initial values, tuned in Cycle 4 on a validation split (DECISIONS 2026-10-13). */
export const DEFAULT_HYBRID_OPTIONS: HybridOptions = {
  contentWeight: 0.35,
  collabWeight: 0.65,
  coldStartThreshold: 3,
  topN: 10,
};

export type HybridPath = "content-only" | "weighted";

/**
 * Hybrid recommender: a switching rule for cold-start patrons, a weighted combination for everyone else.
 *  - fewer than `coldStartThreshold` distinct books: content scores only, the collaborative scorer is never called;
 *  - otherwise: final = contentWeight * A_norm + collabWeight * B_norm, where A is min-max scaled per patron over
 *    their candidates and B is clamped to the 1-5 scale and mapped to [0, 1]. A candidate with no CF prediction
 *    contributes 0 from CF.
 * Each item is attributed to CONTENT when its content contribution is at least its CF contribution.
 */
export class HybridEngine implements Recommender {
  readonly name = "hybrid";
  readonly contentWeight: number;
  readonly collabWeight: number;
  readonly coldStartThreshold: number;
  readonly topN: number;

  constructor(
    private readonly content: Scorer,
    private readonly collaborative: Scorer,
    options: Partial<HybridOptions> = {},
  ) {
    const o = { ...DEFAULT_HYBRID_OPTIONS, ...options };
    for (const w of [o.contentWeight, o.collabWeight]) {
      if (!Number.isFinite(w) || w < 0) throw new Error("Hybrid weights must be finite and non-negative");
    }
    this.contentWeight = o.contentWeight;
    this.collabWeight = o.collabWeight;
    this.coldStartThreshold = o.coldStartThreshold;
    this.topN = o.topN;
  }

  /** Decided from the patron's distinct-book count alone, before either component runs. */
  path(history: HistoryItem[]): HybridPath {
    const distinct = new Set(history.map((h) => h.bookId)).size;
    return distinct < this.coldStartThreshold ? "content-only" : "weighted";
  }

  recommend(history: HistoryItem[], n: number = this.topN, context: RecommendContext = {}): ScoredItem[] {
    const contentScores = this.content.score(history, context);
    if (this.path(history) === "content-only") {
      return topN(contentScores, n).map((item) => ({ ...item, source: "CONTENT" as const }));
    }

    const collabScores = this.collaborative.score(history, context);
    const a = minMax(contentScores);
    const final = new Map<number, number>();
    const source = new Map<number, ScoredItem["source"]>();
    // Candidates are every book either component scored (the content scorer normally covers them all).
    for (const bookId of new Set([...a.keys(), ...collabScores.keys()])) {
      const fromContent = this.contentWeight * (a.get(bookId) ?? 0);
      const b = collabScores.get(bookId);
      const fromCollab = b === undefined ? 0 : this.collabWeight * clampScale(b, RATING_MIN, RATING_MAX);
      final.set(bookId, fromContent + fromCollab);
      source.set(bookId, fromContent >= fromCollab ? "CONTENT" : "COLLABORATIVE");
    }
    return topN(final, n).map((item) => ({ ...item, source: source.get(item.bookId) }));
  }
}
