import { describe, expect, it } from "vitest";
import { buildHistory } from "@/lib/recommender/history";
import { buildItemVectors, ContentRecommender } from "@/lib/recommender/content";
import { PopularRecommender } from "@/lib/recommender/popular";
import type { SparseVector } from "@/lib/recommender/tfidf";

describe("ContentRecommender profile and score (hand-computed)", () => {
  // Orthogonal unit vectors: a = (1, 0), b = (0, 1); candidate c = (1, 1) / sqrt 2.
  const vectors = new Map<number, SparseVector>([
    [1, { 0: 1 }],
    [2, { 1: 1 }],
    [3, { 0: Math.SQRT1_2, 1: Math.SQRT1_2 }],
    [4, { 0: 1 }],
    [5, { 1: 1 }],
  ]);
  const r = new ContentRecommender(vectors, { borrowWeight: 3 });

  it("profile is the rating-weighted mean of the book vectors", () => {
    // (4a + 2b) / 6 = (2/3, 1/3)
    const p = r.profile([
      { bookId: 1, ratingValue: 4 },
      { bookId: 2, ratingValue: 2 },
    ])!;
    expect(p.vector[0]).toBeCloseTo(2 / 3, 12);
    expect(p.vector[1]).toBeCloseTo(1 / 3, 12);
  });

  it("scores by cosine similarity with the profile", () => {
    const scores = r.score([
      { bookId: 1, ratingValue: 4 },
      { bookId: 2, ratingValue: 2 },
    ]);
    // cos(c, (2/3, 1/3)) = (1/sqrt2) / sqrt(5/9) = 0.948683; cos(d = a) = (2/3) / sqrt(5/9) = 0.894427; cos(e = b) = 0.447214
    expect(scores.get(3)).toBeCloseTo(0.948683, 5);
    expect(scores.get(4)).toBeCloseTo(0.894427, 5);
    expect(scores.get(5)).toBeCloseTo(0.447214, 5);
  });

  it("excludes books already in the history", () => {
    const scores = r.score([{ bookId: 1, ratingValue: 5 }]);
    expect(scores.has(1)).toBe(false);
    expect([...scores.keys()].sort()).toEqual([2, 3, 4, 5]);
  });

  it("gives a borrow-only book the configured borrowWeight", () => {
    // borrow of a (weight 3) + rating 5 of b: profile (3, 5) / 8
    const p = r.profile([
      { bookId: 1, ratingValue: null },
      { bookId: 2, ratingValue: 5 },
    ])!;
    expect(p.vector[0]).toBeCloseTo(3 / 8, 12);
    expect(p.vector[1]).toBeCloseTo(5 / 8, 12);
  });

  it("returns nothing when no history book has a vector", () => {
    expect(r.recommend([], 5)).toEqual([]);
    expect(r.recommend([{ bookId: 999, ratingValue: 5 }], 5)).toEqual([]);
  });
});

describe("TC05: content scoring on a small catalogue", () => {
  const books = [
    { id: 1, contentText: "fantasy dragons wizard magic quest kingdom" },
    { id: 2, contentText: "fantasy dragons sword magic battle kingdom" },
    { id: 3, contentText: "fantasy wizard magic school spells quest" },
    { id: 4, contentText: "cooking recipes kitchen pasta baking dinner" },
    { id: 5, contentText: "cooking baking bread kitchen dessert recipes" },
    { id: 6, contentText: "history empire war ancient rome battle" },
  ];
  const { vectors } = buildItemVectors(books);
  const recommender = new ContentRecommender(vectors);
  const history = buildHistory([
    { bookId: 1, type: "BORROW", ratingValue: null },
    { bookId: 1, type: "RATE", ratingValue: 5 },
  ]);

  it("scores every candidate and excludes the history", () => {
    const scores = recommender.score(history);
    expect([...scores.keys()].sort()).toEqual([2, 3, 4, 5, 6]);
    for (const s of scores.values()) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("ranks metadata-similar books above unrelated ones, best first", () => {
    const recs = recommender.recommend(history, 5);
    expect(recs.slice(0, 2).map((r) => r.bookId).sort()).toEqual([2, 3]);
    expect(recs.map((r) => r.score)).toEqual([...recs.map((r) => r.score)].sort((a, b) => b - a));
    const byId = new Map(recs.map((r) => [r.bookId, r.score]));
    expect(Math.min(byId.get(2)!, byId.get(3)!)).toBeGreaterThan(Math.max(byId.get(4)!, byId.get(5)!));
  });

  it("limits the list to n", () => {
    expect(recommender.recommend(history, 3)).toHaveLength(3);
  });
});

describe("buildHistory", () => {
  it("collapses to one entry per book and prefers a rating over a borrow", () => {
    const h = buildHistory([
      { bookId: 2, type: "RATE", ratingValue: 4 },
      { bookId: 2, type: "BORROW", ratingValue: null },
      { bookId: 1, type: "BORROW", ratingValue: null },
    ]);
    expect(h).toEqual([
      { bookId: 1, ratingValue: null },
      { bookId: 2, ratingValue: 4 },
    ]);
  });
});

describe("PopularRecommender", () => {
  it("ranks by popularity, skipping books the patron already has", () => {
    const r = new PopularRecommender(
      new Map([
        [1, 10],
        [2, 30],
        [3, 20],
        [4, 20],
      ]),
    );
    expect(r.recommend([{ bookId: 2, ratingValue: 5 }], 3).map((x) => x.bookId)).toEqual([3, 4, 1]);
  });
});
