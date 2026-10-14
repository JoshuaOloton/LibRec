import { buildHistory } from "../recommender/history";
import type { Recommender } from "../recommender/types";
import { mean, std, topNMetrics } from "./metrics";
import { splitInteractions, type EvalInteraction, type SplitOptions } from "./split";

/** A held-out book is relevant only if it is a real RATE with at least this rating (DECISIONS 2026-10-13). */
export const RELEVANCE_THRESHOLD = 4;
export const COLD_START_THRESHOLD = 3;

export type Segment = "all" | "cold" | "warm";
export const SEGMENTS: Segment[] = ["all", "cold", "warm"];

export interface EvalConfig {
  name: string;
  label: string;
  /** True for sanity references that are not part of the hypothesis. */
  baseline: boolean;
  /** Build the recommender from training interactions only. */
  build(train: EvalInteraction[]): Recommender;
}

export interface EvalOptions {
  n: number;
  /** Also return each evaluated patron's F1 per configuration (for paired significance tests). Off by default. */
  collectPatrons?: boolean;
  split?: SplitOptions;
  coldStartThreshold?: number;
}

export interface SegmentSummary {
  users: number;
  precision: number;
  recall: number;
  f1: number;
  /** Share of evaluated patrons who received no recommendation. */
  coverageNone: number;
  /** Share who received 1 to N-1 recommendations. */
  coveragePartial: number;
  /** Share who received a full list of N. */
  coverageFull: number;
  /**
   * Supplementary: the same metrics over only the patrons who received at least one recommendation. Kept apart from
   * the headline numbers; NaN when nobody in the segment was covered.
   */
  coveredUsers: number;
  precisionCovered: number;
  recallCovered: number;
  f1Covered: number;
  /** Share of all recommended items attributed to each component (hybrid only; NaN otherwise or with no items). */
  contentShare: number;
  collabShare: number;
}

export interface SeedResult {
  seed: number;
  trainInteractions: number;
  testInteractions: number;
  testUsers: number;
  /** Test patrons with no relevant held-out book, left out of the metrics. */
  skippedUsers: number;
  configs: Record<string, Record<Segment, SegmentSummary>>;
  /**
   * Only with `collectPatrons`: the evaluated patrons (ascending id) and, per configuration, each one's F1@N in the
   * same order, so two configurations can be paired by patron. `cold[i]` is true when patron i is in the cold segment.
   */
  patrons?: { userIds: number[]; cold: boolean[]; f1: Record<string, number[]> };
}

export interface Aggregate {
  /** Per-seed values, in the order of `seeds`. */
  perSeed: number[];
  mean: number;
  std: number;
}

export interface ConfigAggregate {
  segments: Record<
    Segment,
    {
      users: Aggregate;
      precision: Aggregate;
      recall: Aggregate;
      f1: Aggregate;
      coverageNone: Aggregate;
      coveragePartial: Aggregate;
      coverageFull: Aggregate;
      coveredUsers: Aggregate;
      precisionCovered: Aggregate;
      recallCovered: Aggregate;
      f1Covered: Aggregate;
      contentShare: Aggregate;
      collabShare: Aggregate;
    }
  >;
}

export function evaluateSeed(
  interactions: EvalInteraction[],
  seed: number,
  configs: EvalConfig[],
  options: EvalOptions,
): SeedResult {
  const { train, test } = splitInteractions(interactions, seed, options.split);
  return evaluatePartition(train, test, seed, configs, options);
}

/**
 * Evaluate every configuration on one given partition. Configurations are built from `train` only. The same entry point
 * serves the test partition and, for weight tuning, a validation partition carved out of the training rows.
 */
export function evaluatePartition(
  train: EvalInteraction[],
  test: EvalInteraction[],
  seed: number,
  configs: EvalConfig[],
  options: EvalOptions,
): SeedResult {
  const threshold = options.coldStartThreshold ?? COLD_START_THRESHOLD;

  const trainByUser = groupByUser(train);
  const relevantByUser = new Map<number, Set<number>>();
  const testUsers = new Set<number>();
  for (const row of test) {
    testUsers.add(row.userId);
    if (row.type === "RATE" && row.ratingValue !== null && row.ratingValue >= RELEVANCE_THRESHOLD) {
      let set = relevantByUser.get(row.userId);
      if (!set) relevantByUser.set(row.userId, (set = new Set()));
      set.add(row.bookId);
    }
  }

  const evaluated = [...relevantByUser.keys()].sort((a, b) => a - b);
  const result: SeedResult = {
    seed,
    trainInteractions: train.length,
    testInteractions: test.length,
    testUsers: testUsers.size,
    skippedUsers: testUsers.size - evaluated.length,
    configs: {},
  };

  const empty = () => ({
    p: [] as number[],
    r: [] as number[],
    f: [] as number[],
    cp: [] as number[],
    cr: [] as number[],
    cf: [] as number[],
    none: 0,
    partial: 0,
    full: 0,
    content: 0,
    collab: 0,
  });
  type Rows = Record<Segment, ReturnType<typeof empty>>;
  const built = configs.map((config) => ({
    config,
    recommender: config.build(train),
    rows: { all: empty(), cold: empty(), warm: empty() } as Rows,
  }));

  // Patron-outer, configuration-inner: results are identical to a configuration-outer loop (recommenders are
  // stateless per patron), and configurations that share per-patron scoring can cache the last patron's scores.
  const cold: boolean[] = [];
  for (const userId of evaluated) {
    const history = buildHistory(trainByUser.get(userId) ?? []);
    cold.push(history.length < threshold);
    for (const { recommender, rows } of built) {
      const items = recommender.recommend(history, options.n, { userId });
      const recs = items.map((r) => r.bookId);
      const m = topNMetrics(recs, relevantByUser.get(userId)!, options.n);
      for (const seg of ["all", history.length < threshold ? "cold" : "warm"] as Segment[]) {
        const row = rows[seg];
        row.p.push(m.precision);
        row.r.push(m.recall);
        row.f.push(m.f1);
        if (recs.length === 0) row.none++;
        else {
          row.cp.push(m.precision);
          row.cr.push(m.recall);
          row.cf.push(m.f1);
          if (recs.length < options.n) row.partial++;
          else row.full++;
        }
        for (const item of items) {
          if (item.source === "CONTENT") row.content++;
          else if (item.source === "COLLABORATIVE") row.collab++;
        }
      }
    }
  }

  if (options.collectPatrons) {
    result.patrons = {
      userIds: evaluated,
      cold,
      // rows.all holds one entry per evaluated patron, in the loop's order
      f1: Object.fromEntries(built.map(({ config, rows }) => [config.name, rows.all.f])),
    };
  }

  for (const { config, rows } of built) {
    result.configs[config.name] = Object.fromEntries(
      SEGMENTS.map((seg) => {
        const row = rows[seg];
        const users = row.p.length;
        return [
          seg,
          {
            users,
            precision: mean(row.p),
            recall: mean(row.r),
            f1: mean(row.f),
            coverageNone: row.none / users,
            coveragePartial: row.partial / users,
            coverageFull: row.full / users,
            coveredUsers: row.cp.length,
            precisionCovered: mean(row.cp),
            recallCovered: mean(row.cr),
            f1Covered: mean(row.cf),
            contentShare: row.content + row.collab === 0 ? NaN : row.content / (row.content + row.collab),
            collabShare: row.content + row.collab === 0 ? NaN : row.collab / (row.content + row.collab),
          },
        ];
      }),
    ) as Record<Segment, SegmentSummary>;
  }
  return result;
}

/** Mean and sample standard deviation across seeds, per configuration and segment. */
export function aggregate(results: SeedResult[], configName: string): ConfigAggregate {
  const agg = (pick: (s: SegmentSummary) => number, seg: Segment): Aggregate => {
    const perSeed = results.map((r) => pick(r.configs[configName][seg]));
    const valid = perSeed.filter((x) => !Number.isNaN(x));
    return { perSeed, mean: mean(valid), std: std(valid) };
  };
  return {
    segments: Object.fromEntries(
      SEGMENTS.map((seg) => [
        seg,
        {
          users: agg((s) => s.users, seg),
          precision: agg((s) => s.precision, seg),
          recall: agg((s) => s.recall, seg),
          f1: agg((s) => s.f1, seg),
          coverageNone: agg((s) => s.coverageNone, seg),
          coveragePartial: agg((s) => s.coveragePartial, seg),
          coverageFull: agg((s) => s.coverageFull, seg),
          coveredUsers: agg((s) => s.coveredUsers, seg),
          precisionCovered: agg((s) => s.precisionCovered, seg),
          recallCovered: agg((s) => s.recallCovered, seg),
          f1Covered: agg((s) => s.f1Covered, seg),
          contentShare: agg((s) => s.contentShare, seg),
          collabShare: agg((s) => s.collabShare, seg),
        },
      ]),
    ) as ConfigAggregate["segments"],
  };
}

function groupByUser(rows: EvalInteraction[]): Map<number, EvalInteraction[]> {
  const out = new Map<number, EvalInteraction[]>();
  for (const row of rows) {
    const list = out.get(row.userId);
    if (list) list.push(row);
    else out.set(row.userId, [row]);
  }
  return out;
}
