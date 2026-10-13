import { describe, expect, it, vi } from "vitest";
import { CollaborativeRecommender, type Rating } from "@/lib/recommender/collaborative";
import { ContentRecommender } from "@/lib/recommender/content";
import { DEFAULT_HYBRID_OPTIONS, HybridEngine, type Scorer } from "@/lib/recommender/hybrid";
import { clampScale, minMax } from "@/lib/recommender/normalise";
import type { SparseVector } from "@/lib/recommender/tfidf";
import type { HistoryItem } from "@/lib/recommender/types";

const stub = (scores: Record<number, number>): Scorer => ({
  score: vi.fn(() => new Map(Object.entries(scores).map(([id, s]) => [Number(id), s]))),
});

const rated = (...pairs: [number, number][]): HistoryItem[] => pairs.map(([bookId, ratingValue]) => ({ bookId, ratingValue }));
const borrowed = (...ids: number[]): HistoryItem[] => ids.map((bookId) => ({ bookId, ratingValue: null }));

// A small real catalogue: books 1-2 share term 0, books 3 and 5 share term 1, books 6-7 share term 2, book 4 is term 0.
const vectors = new Map<number, SparseVector>([
  [1, { 0: 1 }],
  [2, { 0: 1 }],
  [3, { 1: 1 }],
  [4, { 0: 1 }],
  [5, { 1: 1 }],
  [6, { 2: 1 }],
  [7, { 2: 1 }],
]);
const r = (userId: number, ratings: Record<number, number>): Rating[] =>
  Object.entries(ratings).map(([bookId, ratingValue]) => ({ userId, bookId: Number(bookId), ratingValue }));
const ratings: Rating[] = [...r(1, { 1: 5, 2: 4, 3: 2, 4: 5, 5: 1 }), ...r(2, { 1: 4, 2: 5, 3: 1, 5: 2, 6: 5 })];

function realEngine() {
  const content = new ContentRecommender(vectors);
  const collab = new CollaborativeRecommender(ratings);
  return {
    content,
    collab,
    contentScore: vi.spyOn(content, "score"),
    collabScore: vi.spyOn(collab, "score"),
    collabRecommend: vi.spyOn(collab, "recommend"),
    collabNeighbours: vi.spyOn(collab, "neighbours"),
    engine: new HybridEngine(content, collab),
  };
}

describe("TC07 cold-start switch (2 distinct books)", () => {
  it("uses content only and never invokes the collaborative recommender", () => {
    const t = realEngine();
    const history = rated([1, 5], [2, 4]);
    expect(t.engine.path(history)).toBe("content-only");
    // A repeated entry for book 1 (a borrow plus a rating) is still 2 distinct books, not 3.
    expect(t.engine.path([...history, { bookId: 1, ratingValue: null }])).toBe("content-only");
    const out = t.engine.recommend(history, 10, { userId: 100 });
    expect(t.collabScore).not.toHaveBeenCalled();
    expect(t.collabRecommend).not.toHaveBeenCalled();
    expect(t.collabNeighbours).not.toHaveBeenCalled();
    expect(t.contentScore).toHaveBeenCalledTimes(1);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((item) => item.source === "CONTENT")).toBe(true);
    expect(out.map((o) => o.bookId)).toEqual(t.content.recommend(history, 10).map((o) => o.bookId));
  });

  it("also skips collaborative filtering for a patron with borrows only", () => {
    const collab = stub({ 4: 5 });
    const engine = new HybridEngine(stub({ 4: 0.5 }), collab);
    engine.recommend(borrowed(1, 2), 10, { userId: 100 });
    expect(collab.score).not.toHaveBeenCalled();
  });
});

describe("TC08 threshold boundary (exactly 3 distinct books)", () => {
  it("takes the weighted path and invokes both components", () => {
    const t = realEngine();
    const history = rated([1, 5], [2, 4], [3, 3]);
    expect(t.engine.path(history)).toBe("weighted");
    const out = t.engine.recommend(history, 10, { userId: 100 });
    expect(t.contentScore).toHaveBeenCalledTimes(1);
    expect(t.collabScore).toHaveBeenCalledTimes(1);
    expect(t.collabScore).toHaveBeenCalledWith(history, { userId: 100 });
    expect(out.map((o) => o.bookId).sort()).toEqual([4, 5, 6, 7]);
  });

  it("counts a borrow as one of the three books", () => {
    const content = stub({ 9: 0.4 });
    const collab = stub({ 9: 4 });
    new HybridEngine(content, collab).recommend([...rated([1, 5], [2, 4]), ...borrowed(3)], 10);
    expect(collab.score).toHaveBeenCalledTimes(1);
  });

  it("switches exactly at coldStartThreshold", () => {
    const e = new HybridEngine(stub({}), stub({}), { coldStartThreshold: 5 });
    expect(e.path(borrowed(1, 2, 3, 4))).toBe("content-only");
    expect(e.path(borrowed(1, 2, 3, 4, 5))).toBe("weighted");
  });
});

describe("TC09 normalisation and weights (hand-computed)", () => {
  // Patron has 3 books (1-3), so the weighted path runs. Candidates 11-14:
  //   content cosine A: 11 -> 0.9, 12 -> 0.5, 13 -> 0.1, 14 -> 0.3  => min-max (min 0.1, max 0.9, range 0.8):
  //                      A_norm = 1, 0.5, 0, 0.25
  //   CF prediction B:  11 -> 3, 12 -> 5, 13 -> 6.2 (clamped to 5), 14 -> none
  //                      B_norm = (3-1)/4 = 0.5, (5-1)/4 = 1, 1, 0
  const history = rated([1, 5], [2, 4], [3, 3]);
  const content = () => stub({ 11: 0.9, 12: 0.5, 13: 0.1, 14: 0.3 });
  const collab = () => stub({ 11: 3, 12: 5, 13: 6.2 });

  it("combines with the default 0.35 / 0.65 weights", () => {
    // 11: 0.35*1    + 0.65*0.5 = 0.675
    // 12: 0.35*0.5  + 0.65*1   = 0.825
    // 13: 0.35*0    + 0.65*1   = 0.650
    // 14: 0.35*0.25 + 0.65*0   = 0.0875   (no CF prediction: contributes 0)
    const out = new HybridEngine(content(), collab()).recommend(history, 10);
    expect(out.map((o) => o.bookId)).toEqual([12, 11, 13, 14]);
    expect(out.map((o) => o.score)).toEqual([
      expect.closeTo(0.825, 12),
      expect.closeTo(0.675, 12),
      expect.closeTo(0.65, 12),
      expect.closeTo(0.0875, 12),
    ]);
  });

  it("attributes each item to the larger contribution (ties to CONTENT)", () => {
    const out = new HybridEngine(content(), collab()).recommend(history, 10);
    const source = Object.fromEntries(out.map((o) => [o.bookId, o.source]));
    // 11: content 0.35 vs collab 0.325; 12: 0.175 vs 0.65; 13: 0 vs 0.65; 14: 0.0875 vs 0
    expect(source).toEqual({ 11: "CONTENT", 12: "COLLABORATIVE", 13: "COLLABORATIVE", 14: "CONTENT" });
    const tied = new HybridEngine(stub({ 11: 0.5 }), stub({}), {}).recommend(history, 10);
    expect(tied[0].source).toBe("CONTENT"); // 0 vs 0 -> CONTENT
  });

  it("follows the weights it is given", () => {
    // 0.2 / 0.8:  11: 0.2 + 0.4 = 0.6;  12: 0.1 + 0.8 = 0.9;  13: 0 + 0.8 = 0.8;  14: 0.05
    const out = new HybridEngine(content(), collab(), { contentWeight: 0.2, collabWeight: 0.8 }).recommend(history, 10);
    expect(out.map((o) => [o.bookId, o.score])).toEqual([
      [12, expect.closeTo(0.9, 12)],
      [13, expect.closeTo(0.8, 12)],
      [11, expect.closeTo(0.6, 12)],
      [14, expect.closeTo(0.05, 12)],
    ]);
    // contentWeight 1: the content ranking; contentWeight 0: CF only (books with no prediction tie at 0)
    expect(new HybridEngine(content(), collab(), { contentWeight: 1, collabWeight: 0 }).recommend(history, 10).map((o) => o.bookId)).toEqual([11, 12, 14, 13]);
    expect(new HybridEngine(content(), collab(), { contentWeight: 0, collabWeight: 1 }).recommend(history, 10).map((o) => o.bookId)).toEqual([12, 13, 11, 14]);
  });

  it("gives a patron with no CF neighbours exactly the content ranking", () => {
    const out = new HybridEngine(content(), stub({})).recommend(history, 10);
    expect(out.map((o) => o.bookId)).toEqual([11, 12, 14, 13]);
    expect(out.every((o) => o.source === "CONTENT")).toBe(true);
  });

  it("normalises per patron, not globally", () => {
    // The same cosine ordering with a tiny spread still spans the full [0, 1] range after min-max.
    const out = new HybridEngine(stub({ 11: 0.011, 12: 0.010 }), stub({})).recommend(history, 10);
    expect(out[0].score).toBeCloseTo(0.35, 12);
    expect(out[1].score).toBeCloseTo(0, 12);
  });

  it("rejects negative weights", () => {
    expect(() => new HybridEngine(stub({}), stub({}), { contentWeight: -0.1 })).toThrow();
  });

  it("exposes its settings as named fields", () => {
    const e = new HybridEngine(stub({}), stub({}));
    expect([e.contentWeight, e.collabWeight, e.coldStartThreshold, e.topN]).toEqual([0.35, 0.65, 3, 10]);
    expect(DEFAULT_HYBRID_OPTIONS).toEqual({ contentWeight: 0.35, collabWeight: 0.65, coldStartThreshold: 3, topN: 10 });
  });
});

describe("normalise", () => {
  it("min-max maps the lowest to 0 and the highest to 1", () => {
    const out = minMax(new Map([[1, 2], [2, 4], [3, 3]]));
    expect([out.get(1), out.get(2), out.get(3)]).toEqual([0, 1, 0.5]);
  });

  it("maps equal scores to 0 and an empty map to an empty map", () => {
    expect([...minMax(new Map([[1, 0.7], [2, 0.7]])).values()]).toEqual([0, 0]);
    expect(minMax(new Map()).size).toBe(0);
  });

  it("clamps then scales a rating prediction onto [0, 1]", () => {
    expect([clampScale(1, 1, 5), clampScale(3, 1, 5), clampScale(5, 1, 5)]).toEqual([0, 0.5, 1]);
    expect(clampScale(6.2, 1, 5)).toBe(1);
    expect(clampScale(-0.5, 1, 5)).toBe(0);
  });
});

describe("TC10 ranked output", () => {
  it("returns the top N sorted by final score, descending, without books the patron has", () => {
    const t = realEngine();
    const history = rated([1, 5], [2, 4], [3, 3]);
    const out = t.engine.recommend(history, 3, { userId: 100 });
    expect(out).toHaveLength(3);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    for (const item of out) expect([1, 2, 3]).not.toContain(item.bookId);
    const all = t.engine.recommend(history, 10, { userId: 100 });
    expect(all.slice(0, 3)).toEqual(out);
  });

  it("breaks ties by ascending book id and defaults N to topN", () => {
    const content = stub(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [20 + i, 0.5])));
    const out = new HybridEngine(content, stub({})).recommend(rated([1, 5], [2, 4], [3, 3]));
    expect(out).toHaveLength(10);
    expect(out.map((o) => o.bookId)).toEqual(Array.from({ length: 10 }, (_, i) => 20 + i));
  });

  it("sorts the cold path descending too", () => {
    const out = new HybridEngine(stub({ 5: 0.2, 6: 0.9, 7: 0.5 }), stub({})).recommend(rated([1, 5], [2, 4]), 10);
    expect(out.map((o) => o.bookId)).toEqual([6, 7, 5]);
  });
});
