import { CollaborativeRecommender, DEFAULT_COLLABORATIVE_OPTIONS } from "../recommender/collaborative";
import { buildItemVectors, ContentRecommender, DEFAULT_CONTENT_OPTIONS } from "../recommender/content";
import { HybridEngine, INITIAL_HYBRID_OPTIONS, type Scorer } from "../recommender/hybrid";
import { PopularRecommender } from "../recommender/popular";
import type { EvalConfig } from "./runner";
import type { EvalInteraction } from "./split";

/** Cache the last patron's scores: hybrid configurations on one partition share per-patron scoring work. */
function lastPatron(scorer: Scorer): Scorer {
  let key: number | undefined;
  let value: Map<number, number> | undefined;
  return {
    score(history, context) {
      if (context?.userId === undefined) return scorer.score(history, context);
      if (key !== context.userId || !value) {
        value = scorer.score(history, context);
        key = context.userId;
      }
      return value;
    },
  };
}

/**
 * The configurations the harness compares, built from the same engine code as the app. TF-IDF is fitted once over the
 * catalogue text (no interaction information; DECISIONS 2026-10-13). Shared by scripts/evaluate.ts and
 * scripts/significance.ts so both always evaluate exactly the same thing.
 */
export function createEvalConfigs(books: { id: number; contentText: string }[]) {
  const { model, vectors } = buildItemVectors(books);
  const content = new ContentRecommender(vectors, DEFAULT_CONTENT_OPTIONS);

  // Per training partition: one CF model (fitted on training explicit ratings only; borrows never enter CF,
  // DECISIONS 2026-10-13) and per-patron score caches shared by every hybrid configuration on that partition.
  const sharedByTrain = new WeakMap<EvalInteraction[], { cf: CollaborativeRecommender; content: Scorer; collab: Scorer }>();
  const shared = (train: EvalInteraction[]) => {
    let s = sharedByTrain.get(train);
    if (!s) {
      const cf = new CollaborativeRecommender(
        train
          .filter((r) => r.type === "RATE" && r.ratingValue !== null)
          .map((r) => ({ userId: r.userId, bookId: r.bookId, ratingValue: r.ratingValue! })),
        DEFAULT_COLLABORATIVE_OPTIONS,
      );
      sharedByTrain.set(train, (s = { cf, content: lastPatron(content), collab: lastPatron(cf) }));
    }
    return s;
  };

  const hybridConfig = (name: string, label: string, contentWeight: number): EvalConfig => ({
    name,
    label,
    baseline: false,
    build: (train) => {
      const s = shared(train);
      const collabWeight = Math.round((1 - contentWeight) * 1000) / 1000; // collabWeight = 1 - contentWeight, no float noise
      return new HybridEngine(s.content, s.collab, { contentWeight, collabWeight });
    },
  });

  const available: Record<string, EvalConfig> = {
    content: { name: "content", label: "Content-based (TF-IDF + cosine)", baseline: false, build: () => content },
    collab: {
      name: "collab",
      label: "Collaborative (user-user Pearson)",
      baseline: false,
      build: (train) => shared(train).cf,
    },
    hybrid: hybridConfig(
      "hybrid",
      `Hybrid, initial weights (${INITIAL_HYBRID_OPTIONS.contentWeight} content / ${INITIAL_HYBRID_OPTIONS.collabWeight} collab)`,
      INITIAL_HYBRID_OPTIONS.contentWeight,
    ),
    popular: {
      name: "popular",
      label: "Most popular (sanity check, NOT part of the hypothesis)",
      baseline: true,
      build: (train) => {
        const readers = new Map<number, Set<number>>();
        for (const row of train) {
          let set = readers.get(row.bookId);
          if (!set) readers.set(row.bookId, (set = new Set()));
          set.add(row.userId);
        }
        return new PopularRecommender(new Map([...readers].map(([id, users]) => [id, users.size])));
      },
    },
  };

  return { model, available, hybridConfig };
}
