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
}

export interface SeedResult {
  seed: number;
  trainInteractions: number;
  testInteractions: number;
  testUsers: number;
  /** Test patrons with no relevant held-out book, left out of the metrics. */
  skippedUsers: number;
  configs: Record<string, Record<Segment, SegmentSummary>>;
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

  for (const config of configs) {
    const recommender = config.build(train);
    const empty = () => ({ p: [] as number[], r: [] as number[], f: [] as number[], none: 0, partial: 0, full: 0 });
    const rows: Record<Segment, ReturnType<typeof empty>> = { all: empty(), cold: empty(), warm: empty() };
    for (const userId of evaluated) {
      const history = buildHistory(trainByUser.get(userId) ?? []);
      const recs = recommender.recommend(history, options.n, { userId }).map((r) => r.bookId);
      const m = topNMetrics(recs, relevantByUser.get(userId)!, options.n);
      for (const seg of ["all", history.length < threshold ? "cold" : "warm"] as Segment[]) {
        rows[seg].p.push(m.precision);
        rows[seg].r.push(m.recall);
        rows[seg].f.push(m.f1);
        if (recs.length === 0) rows[seg].none++;
        else if (recs.length < options.n) rows[seg].partial++;
        else rows[seg].full++;
      }
    }
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
