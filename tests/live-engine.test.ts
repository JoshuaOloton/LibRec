import { describe, expect, it } from "vitest";
import { CollaborativeRecommender, type Rating } from "@/lib/recommender/collaborative";
import { ContentRecommender } from "@/lib/recommender/content";
import type { SparseVector } from "@/lib/recommender/tfidf";
import type { HistoryItem } from "@/lib/recommender/types";

// Methods the live app relies on: in-place CF updates, explanations, and content helpers.

const vectors = new Map<number, SparseVector>([
  [1, { 0: 1 }],
  [2, { 0: 1 }],
  [3, { 1: 1 }],
  [4, { 0: 0.6, 1: 0.8 }],
  [5, { 1: 1 }],
  [6, { 2: 1 }],
]);

const r = (userId: number, ratings: Record<number, number>): Rating[] =>
  Object.entries(ratings).map(([bookId, ratingValue]) => ({ userId, bookId: Number(bookId), ratingValue }));
const rated = (...pairs: [number, number][]): HistoryItem[] => pairs.map(([bookId, ratingValue]) => ({ bookId, ratingValue }));

describe("ContentRecommender helpers", () => {
  const content = new ContentRecommender(vectors);

  it("similarity is the cosine of two books' vectors (hand-computed)", () => {
    expect(content.similarity(1, 2)).toBeCloseTo(1, 12);
    expect(content.similarity(1, 3)).toBe(0);
    // book 4 = (0.6, 0.8) on terms 0 and 1, unit length: cosine with term 0 alone is 0.6, with term 1 alone is 0.8
    expect(content.similarity(4, 1)).toBeCloseTo(0.6, 12);
    expect(content.similarity(4, 3)).toBeCloseTo(0.8, 12);
    expect(content.similarity(1, 999)).toBe(0);
  });

  it("names the patron's own closest book, ties going to the lower id", () => {
    expect(content.mostSimilarOwn(4, [1, 3])).toEqual({ bookId: 3, similarity: expect.closeTo(0.8, 12) });
    expect(content.mostSimilarOwn(2, [1, 6])).toEqual({ bookId: 1, similarity: expect.closeTo(1, 12) });
    expect(content.mostSimilarOwn(2, [])).toBeNull();
    // 6 and 3 are both orthogonal to book 1: equal similarity (0), the lower id wins
    expect(content.mostSimilarOwn(1, [6, 3])?.bookId).toBe(3);
  });

  it("similarTo ranks the nearest books and leaves the book itself out", () => {
    const out = content.similarTo(1, 3);
    expect(out.map((o) => o.bookId)).toEqual([2, 4, 3]);
    expect(out[0].score).toBeCloseTo(1, 12);
  });

  it("a genre centroid counts every genre equally, however many books it has", () => {
    // genre A = books 1, 2 (term 0), genre B = book 6 (term 2). Book weights are 1/2, 1/2 and 1, which sum to 2,
    // so the centroid is (1/2 + 1/2) / 2 = 1/2 on term 0 and 1 / 2 = 1/2 on term 2: each genre contributes the same.
    const centroid = content.groupCentroid([[1, 2], [6]])!;
    expect(centroid.vector[0]).toBeCloseTo(1 / 2, 12);
    expect(centroid.vector[2]).toBeCloseTo(1 / 2, 12);
    const scores = content.scoreProfile(centroid, new Set([1, 2, 6]));
    expect(scores.has(1)).toBe(false);
    expect(scores.get(3)).toBe(0);
  });

  it("scores through scoreProfile exactly as score() does", () => {
    const history = rated([1, 5], [3, 2]);
    expect(new Map(content.score(history))).toEqual(content.scoreProfile(content.profile(history)!, new Set([1, 3])));
  });
});

describe("CollaborativeRecommender live updates", () => {
  const base = [...r(1, { 1: 5, 2: 4, 3: 2, 4: 5, 5: 1 }), ...r(2, { 1: 4, 2: 5, 3: 1, 5: 2, 6: 5 })];
  const user3 = r(3, { 1: 5, 2: 4, 3: 2, 6: 5 });
  const history = rated([1, 5], [2, 4], [3, 3]);

  it("upsertRating gives the same predictions as a model built from scratch with the rating", () => {
    const live = new CollaborativeRecommender(base);
    for (const row of user3) live.upsertRating(row.userId, row.bookId, row.ratingValue);
    const scratch = new CollaborativeRecommender([...base, ...user3]);
    const a = live.score(history, { userId: 100 });
    const b = scratch.score(history, { userId: 100 });
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
    for (const [id, v] of b) expect(a.get(id)).toBeCloseTo(v, 12);
    expect(live.neighbours(history, { userId: 100 })).toEqual(scratch.neighbours(history, { userId: 100 }));
  });

  it("re-rating replaces the old value instead of adding a second rater", () => {
    const live = new CollaborativeRecommender([...base, ...user3]);
    live.upsertRating(3, 1, 1);
    const scratch = new CollaborativeRecommender([...base, ...user3.map((x) => (x.bookId === 1 ? { ...x, ratingValue: 1 } : x))]);
    expect(live.raterCount(1)).toBe(3);
    const a = live.score(history, { userId: 100 });
    for (const [id, v] of scratch.score(history, { userId: 100 })) expect(a.get(id)).toBeCloseTo(v, 12);
  });

  it("counts raters per book", () => {
    const cf = new CollaborativeRecommender(base);
    expect(cf.raterCount(1)).toBe(2);
    expect(cf.raterCount(4)).toBe(1);
    expect(cf.raterCount(999)).toBe(0);
    expect(cf.raterCounts().get(6)).toBe(1);
  });

  it("neighbourRatings gives the mean rating of the patron's neighbours (hand-computed)", () => {
    const cf = new CollaborativeRecommender(base);
    // The patron rated books 1, 2, 3 as 5, 4, 2. Neighbours need >= 3 co-rated books with positive Pearson:
    // user 1 (5, 4, 2) correlates perfectly; user 2 (4, 5, 1) on the same books: positive but lower.
    const nbs = cf.neighbours(rated([1, 5], [2, 4], [3, 2]), { userId: 100 });
    expect(nbs.map((n) => n.userId).sort()).toEqual([1, 2]);
    const out = cf.neighbourRatings(rated([1, 5], [2, 4], [3, 2]), [4, 6, 999], { userId: 100 });
    expect(out.get(4)).toEqual({ mean: 5, raters: 1 }); // only user 1 rated book 4
    expect(out.get(6)).toEqual({ mean: 5, raters: 1 }); // only user 2 rated book 6
    expect(out.has(999)).toBe(false);
  });

  it("neighbourRatings is empty when the patron has no neighbours", () => {
    const cf = new CollaborativeRecommender(base);
    expect(cf.neighbourRatings(rated([6, 5]), [1, 2]).size).toBe(0);
  });
});
