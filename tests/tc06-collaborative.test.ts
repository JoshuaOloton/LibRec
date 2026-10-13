import { describe, expect, it } from "vitest";
import { CollaborativeRecommender, pearson, type Rating } from "@/lib/recommender/collaborative";
import type { HistoryItem } from "@/lib/recommender/types";

const r = (userId: number, ratings: Record<number, number>): Rating[] =>
  Object.entries(ratings).map(([bookId, ratingValue]) => ({ userId, bookId: Number(bookId), ratingValue }));

// Hand-computed fixture. Target patron (user 100) rated books 1:5, 2:3, 3:4 (mean 4).
//
// v (user 1): 1:4, 2:1, 3:4, 4:5, 5:2, 9:5   mean 21/6 = 3.5
//   co-rated {1,2,3}: x = (5,3,4), mean 4, dx = (1,-1,0); y = (4,1,4), mean 3, dy = (1,-2,1)
//   sum dx*dy = 1+2+0 = 3, sum dx^2 = 2, sum dy^2 = 6  =>  r = 3 / sqrt(12) = 0.8660254
// z (user 2): 1:3, 2:1, 3:5, 4:2        mean 11/4 = 2.75
//   y = (3,1,5), mean 3, dy = (0,-2,2); sum dx*dy = 2, sum dy^2 = 8  =>  r = 2 / sqrt(16) = 0.5
// w (user 3): 1:2, 2:4, 3:3, 6:5
//   y = (2,4,3), mean 3, dy = (-1,1,0); sum dx*dy = -2  =>  r = -1 (negative: never a neighbour)
// m (user 4): 1:5, 2:3, 7:4  -> only 2 co-rated books: r = 1, but below the minimum overlap of 3
// Self (user 100) is also in the matrix with the target's own ratings. The target only borrowed book 9, which v rated.
const ratings: Rating[] = [
  ...r(1, { 1: 4, 2: 1, 3: 4, 4: 5, 5: 2, 9: 5 }),
  ...r(2, { 1: 3, 2: 1, 3: 5, 4: 2 }),
  ...r(3, { 1: 2, 2: 4, 3: 3, 6: 5 }),
  ...r(4, { 1: 5, 2: 3, 7: 4 }),
  ...r(100, { 1: 5, 2: 3, 3: 4 }),
];
const history: HistoryItem[] = [
  { bookId: 1, ratingValue: 5 },
  { bookId: 2, ratingValue: 3 },
  { bookId: 3, ratingValue: 4 },
  { bookId: 9, ratingValue: null }, // borrow only: never used by CF, but still excluded from candidates
];

describe("pearson (hand-computed)", () => {
  const sums = (xs: number[], ys: number[]) =>
    [
      xs.length,
      xs.reduce((a, b) => a + b, 0),
      ys.reduce((a, b) => a + b, 0),
      xs.reduce((a, b) => a + b * b, 0),
      ys.reduce((a, b) => a + b * b, 0),
      xs.reduce((a, b, i) => a + b * ys[i], 0),
    ] as const;

  it("matches the worked values", () => {
    expect(pearson(...sums([5, 3, 4], [4, 1, 4]))).toBeCloseTo(3 / Math.sqrt(12), 12);
    expect(pearson(...sums([5, 3, 4], [3, 1, 5]))).toBeCloseTo(0.5, 12);
    expect(pearson(...sums([5, 3, 4], [2, 4, 3]))).toBeCloseTo(-1, 12);
  });

  it("is undefined without variance or with fewer than two books", () => {
    expect(pearson(...sums([3, 3, 3], [1, 2, 3]))).toBeNull();
    expect(pearson(...sums([4], [4]))).toBeNull();
  });
});

describe("CollaborativeRecommender (TC06)", () => {
  const cf = new CollaborativeRecommender(ratings);

  it("finds neighbours by Pearson: positive only, minimum overlap 3, most similar first, self excluded", () => {
    const nbs = cf.neighbours(history, { userId: 100 });
    expect(nbs.map((n) => n.userId)).toEqual([1, 2]);
    expect(nbs[0].similarity).toBeCloseTo(0.8660254, 6);
    expect(nbs[0].overlap).toBe(3);
    expect(nbs[1].similarity).toBeCloseTo(0.5, 12);
  });

  it("keeps a patron with only two co-rated books out unless the minimum overlap is lowered", () => {
    expect(cf.neighbours(history, { userId: 100 }).some((n) => n.userId === 4)).toBe(false);
    const lenient = new CollaborativeRecommender(ratings, { minOverlap: 2, k: 30 });
    expect(lenient.neighbours(history, { userId: 100 }).some((n) => n.userId === 4)).toBe(true);
  });

  it("applies the mean-centred prediction formula", () => {
    const scores = cf.score(history, { userId: 100 });
    // Book 4: v rated 5 (mean 3.5), z rated 2 (mean 2.75).
    // num = 0.8660254*(5-3.5) + 0.5*(2-2.75) = 1.2990381 - 0.375 = 0.9240381; den = 1.3660254
    // pred = 4 + 0.9240381/1.3660254 = 4.676449
    expect(scores.get(4)).toBeCloseTo(4 + 0.9240381 / 1.3660254, 5);
    // Book 5: only v rated it (2): pred = 4 + (2 - 3.5) = 2.5, whatever the similarity
    expect(scores.get(5)).toBeCloseTo(2.5, 12);
  });

  it("does not predict from books rated only by non-neighbours", () => {
    const scores = cf.score(history, { userId: 100 });
    expect(scores.has(6)).toBe(false); // only w (negative correlation) rated it
    expect(scores.has(7)).toBe(false); // only m (overlap 2) rated it
  });

  it("excludes every book the patron already interacted with, including borrow-only ones", () => {
    const scores = cf.score(history, { userId: 100 });
    for (const id of [1, 2, 3, 9]) expect(scores.has(id)).toBe(false);
  });

  it("ranks by predicted rating, best first", () => {
    expect(cf.recommend(history, 10, { userId: 100 }).map((s) => s.bookId)).toEqual([4, 5]);
  });

  it("returns the short list it has rather than padding it (no backfilling)", () => {
    expect(cf.recommend(history, 10, { userId: 100 })).toHaveLength(2);
  });

  it("uses only the k most similar neighbours", () => {
    const k1 = new CollaborativeRecommender(ratings, { minOverlap: 3, k: 1 });
    // Only v: pred(4) = 4 + 0.866*(5-3.5)/0.866 = 5.5
    expect(k1.score(history, { userId: 100 }).get(4)).toBeCloseTo(5.5, 12);
  });

  it("ignores borrow-only history: no explicit ratings means no recommendations", () => {
    expect(cf.recommend([{ bookId: 1, ratingValue: null }, { bookId: 2, ratingValue: null }], 10, { userId: 100 })).toEqual([]);
  });

  it("gives nothing when fewer than the minimum overlap are co-rated (cold patron with 2 books)", () => {
    const two: HistoryItem[] = [
      { bookId: 1, ratingValue: 5 },
      { bookId: 2, ratingValue: 3 },
    ];
    expect(cf.recommend(two, 10, { userId: 100 })).toEqual([]);
  });

  it("without a userId the patron's own row would be a perfect neighbour (the harness always passes it)", () => {
    expect(cf.neighbours(history).some((n) => n.userId === 100)).toBe(true);
  });
});
