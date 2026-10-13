import { describe, expect, it } from "vitest";
import { topNMetrics, mean, std } from "@/lib/evaluation/metrics";
import { mulberry32 } from "@/lib/evaluation/random";
import { aggregate, evaluatePartition, evaluateSeed, type EvalConfig } from "@/lib/evaluation/runner";
import { splitInteractions, type EvalInteraction } from "@/lib/evaluation/split";
import type { Recommender } from "@/lib/recommender/types";

const rate = (userId: number, bookId: number, ratingValue: number): EvalInteraction => ({
  userId,
  bookId,
  type: "RATE",
  ratingValue,
});
const borrow = (userId: number, bookId: number): EvalInteraction => ({ userId, bookId, type: "BORROW", ratingValue: null });

/** Users with n distinct books each; every even book is also borrowed first (a paired borrow + rate). */
function dataset(sizes: number[]): EvalInteraction[] {
  const rows: EvalInteraction[] = [];
  sizes.forEach((n, u) => {
    for (let b = 1; b <= n; b++) {
      if (b % 2 === 0) rows.push(borrow(u + 1, b));
      rows.push(rate(u + 1, b, 1 + (b % 5)));
    }
  });
  return rows;
}

describe("metrics", () => {
  it("matches a hand-computed example", () => {
    // top-5 = [1, 2, 3, 4, 5]; relevant = {2, 4, 9, 10}: hits = 2, P = 0.4, R = 0.5, F1 = 2*0.4*0.5/0.9 = 0.444444
    const m = topNMetrics([1, 2, 3, 4, 5], new Set([2, 4, 9, 10]), 5);
    expect(m.hits).toBe(2);
    expect(m.precision).toBeCloseTo(0.4, 12);
    expect(m.recall).toBeCloseTo(0.5, 12);
    expect(m.f1).toBeCloseTo(0.444444, 5);
  });

  it("is 0 for no hits, divides precision by N for short lists, and only looks at the top N", () => {
    expect(topNMetrics([1, 2], new Set([3]), 10).f1).toBe(0);
    expect(topNMetrics([1], new Set([1]), 10).precision).toBeCloseTo(0.1, 12);
    expect(topNMetrics([1, 2, 3], new Set([3]), 2).hits).toBe(0);
  });

  it("computes the mean and sample standard deviation", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
    expect(std([5])).toBe(0);
  });
});

describe("splitInteractions", () => {
  const data = dataset([3, 4, 5, 10, 25]);

  it("is deterministic per seed and differs between seeds", () => {
    const a = splitInteractions(data, 1);
    expect(splitInteractions(data, 1)).toEqual(a);
    expect(splitInteractions(data, 2).test).not.toEqual(a.test);
  });

  it("puts every row in exactly one side and keeps both rows of a pair together", () => {
    const { train, test } = splitInteractions(data, 3);
    expect(train.length + test.length).toBe(data.length);
    const trainPairs = new Set(train.map((r) => `${r.userId}:${r.bookId}`));
    for (const r of test) expect(trainPairs.has(`${r.userId}:${r.bookId}`)).toBe(false);
  });

  it("holds out about 20% of distinct books and always keeps at least 2 in training", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { train, test } = splitInteractions(data, seed);
      const count = (rows: EvalInteraction[], u: number) => new Set(rows.filter((r) => r.userId === u).map((r) => r.bookId)).size;
      // sizes 3,4,5,10,25 -> held out 1,1,1,2,5 (min 1, round(0.2 n), leaving >= 2)
      expect([1, 2, 3, 4, 5].map((u) => count(test, u))).toEqual([1, 1, 1, 2, 5]);
      for (let u = 1; u <= 5; u++) expect(count(train, u)).toBeGreaterThanOrEqual(2);
    }
  });

  it("holds nothing out when a patron has only the minimum", () => {
    const { train, test } = splitInteractions([rate(1, 1, 5), rate(1, 2, 5)], 1);
    expect(train).toHaveLength(2);
    expect(test).toHaveLength(0);
  });

  it("mulberry32 is reproducible", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("evaluateSeed", () => {
  // A recommender that always suggests books 1..n; the patron's own training books are excluded by the harness contract.
  const fixed: Recommender = {
    name: "fixed",
    recommend: (history, n) => {
      const seen = new Set(history.map((h) => h.bookId));
      return Array.from({ length: 50 }, (_, i) => i + 1)
        .filter((id) => !seen.has(id))
        .slice(0, n)
        .map((bookId) => ({ bookId, score: 1 }));
    },
  };
  const config: EvalConfig = { name: "fixed", label: "fixed", baseline: true, build: () => fixed };

  it("counts only real ratings >= 4 as relevant and skips patrons with none", () => {
    // Patron 1: 5 books; whichever book is held out is a borrow-only book (never relevant), so they are skipped.
    // Patron 2: 5 books all rated 5; the single held-out book is relevant.
    const rows = [
      ...[1, 2, 3, 4].map((b) => rate(1, b, 5)),
      borrow(1, 5),
      ...[1, 2, 3, 4, 5].map((b) => rate(2, b, 5)),
    ];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = evaluateSeed(rows, seed, [config], { n: 10 });
      expect(r.testUsers).toBe(2);
      const all = r.configs.fixed.all;
      const p1HeldOutBorrow = splitInteractions(rows, seed).test.some((x) => x.userId === 1 && x.type === "BORROW");
      const p1HeldOutLowOrBorrow = p1HeldOutBorrow;
      expect(all.users).toBe(p1HeldOutLowOrBorrow ? 1 : 2);
      expect(r.skippedUsers).toBe(p1HeldOutLowOrBorrow ? 1 : 0);
    }
  });

  it("segments patrons by distinct training books (< 3 is cold) and aggregates across seeds", () => {
    // 3-book patrons keep exactly 2 in training (cold); 10-book patrons keep 8 (warm). All ratings are 5.
    const rows: EvalInteraction[] = [];
    for (let u = 1; u <= 4; u++) for (let b = 1; b <= 3; b++) rows.push(rate(u, b, 5));
    for (let u = 5; u <= 6; u++) for (let b = 1; b <= 10; b++) rows.push(rate(u, b, 5));
    const seeds = [1, 2, 3];
    const results = seeds.map((s) => evaluateSeed(rows, s, [config], { n: 10 }));
    for (const r of results) {
      expect(r.configs.fixed.cold.users).toBe(4);
      expect(r.configs.fixed.warm.users).toBe(2);
      expect(r.configs.fixed.all.users).toBe(6);
    }
    const agg = aggregate(results, "fixed");
    expect(agg.segments.cold.users.mean).toBe(4);
    expect(agg.segments.all.precision.perSeed).toHaveLength(3);
    expect(agg.segments.all.f1.std).toBeGreaterThanOrEqual(0);
  });

  it("reports precision over covered patrons separately, and attribution shares when items carry a source", () => {
    // Patron 1 (10 books, warm) gets a full list; patron 2 (3 books, cold) gets nothing. Both hold out rated-5 books.
    const rows: EvalInteraction[] = [];
    for (let b = 1; b <= 10; b++) rows.push(rate(1, b, 5));
    for (let b = 1; b <= 3; b++) rows.push(rate(2, b, 5));
    const sourced: Recommender = {
      name: "sourced",
      recommend: (history, n, ctx) =>
        ctx?.userId === 2
          ? []
          : Array.from({ length: n }, (_, i) => ({ bookId: 100 + i, score: 1, source: i < 3 ? ("CONTENT" as const) : ("COLLABORATIVE" as const) })),
    };
    const r = evaluateSeed(rows, 1, [{ name: "s", label: "s", baseline: false, build: () => sourced }], { n: 10 });
    const all = r.configs.s.all;
    expect(all.users).toBe(2);
    expect(all.coverageNone).toBeCloseTo(0.5, 12);
    expect(all.coveredUsers).toBe(1);
    // Nobody hits (books 100+ are not held out), so covered precision is 0 and the headline mean includes the empty patron.
    expect(all.precisionCovered).toBe(0);
    expect(all.contentShare).toBeCloseTo(0.3, 12);
    expect(all.collabShare).toBeCloseTo(0.7, 12);
    expect(r.configs.s.cold.coveredUsers).toBe(0);
    expect(r.configs.s.cold.precisionCovered).toBeNaN();
    expect(r.configs.s.cold.contentShare).toBeNaN();
    expect(r.configs.s.warm.contentShare).toBeCloseTo(0.3, 12);
  });

  it("evaluates on a validation partition carved from training rows only", () => {
    const data = dataset([6, 8, 10, 12]);
    const { train, test } = splitInteractions(data, 1);
    const inner = splitInteractions(train, 1001);
    const key = (x: EvalInteraction) => `${x.userId}:${x.bookId}`;
    const outerTest = new Set(test.map(key));
    for (const row of [...inner.train, ...inner.test]) expect(outerTest.has(key(row))).toBe(false);
    expect(inner.train.length + inner.test.length).toBe(train.length);
    // Evaluating the carved partition never builds from, or scores against, the outer test rows.
    const seen: EvalInteraction[][] = [];
    const spy: EvalConfig = { name: "spy", label: "spy", baseline: true, build: (t) => (seen.push(t), { name: "spy", recommend: () => [] }) };
    const res = evaluatePartition(inner.train, inner.test, 1, [spy], { n: 10 });
    expect(seen).toEqual([inner.train]);
    expect(res.testInteractions).toBe(inner.test.length);
  });
});
