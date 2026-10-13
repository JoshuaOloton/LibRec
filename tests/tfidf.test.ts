import { describe, expect, it } from "vitest";
import { cosine, fit, transform } from "@/lib/recommender/tfidf";

/**
 * Hand-computed example. Documents (already tokenised), minDf = 1, so N = 3:
 *   d1 = [cat, dog]   d2 = [cat, fish]   d3 = [dog, dog, cat]
 * df: cat 3, dog 2, fish 1. Vocabulary (sorted): cat = 0, dog = 1, fish = 2.
 * idf = ln((1 + N) / (1 + df)) + 1:
 *   cat  = ln(4/4) + 1 = 1
 *   dog  = ln(4/3) + 1 = 1.2876821
 *   fish = ln(4/2) + 1 = 1.6931472
 * d1: raw (1, 1.2876821, 0), norm = sqrt(1 + 1.2876821^2) = sqrt(2.658125) = 1.630376, so (0.613356, 0.789807, 0)
 * d2: raw (1, 0, 1.6931472), norm = sqrt(1 + 2.866 ) = sqrt(3.866) = 1.966, so (0.508542, 0, 0.861037)
 * cosine(d1, d2) = 0.613356 * 0.508542 = 0.311917 (only "cat" is shared)
 * d3: tf(dog) = 2, so dog / cat = (1 + ln 2) * 1.2876821 / 1 = 2.180235.
 * (Reference values were checked independently of the implementation.)
 */
const docs = [
  ["cat", "dog"],
  ["cat", "fish"],
  ["dog", "dog", "cat"],
];
const model = fit(docs, { minDf: 1 });

describe("tfidf", () => {
  it("builds a sorted vocabulary and smoothed idf", () => {
    expect([...model.vocab]).toEqual([
      ["cat", 0],
      ["dog", 1],
      ["fish", 2],
    ]);
    expect(model.idf[0]).toBeCloseTo(1, 6);
    expect(model.idf[1]).toBeCloseTo(1.2876821, 6);
    expect(model.idf[2]).toBeCloseTo(1.6931472, 6);
  });

  it("matches the hand-computed document vectors", () => {
    const d1 = transform(docs[0], model);
    expect(d1[0]).toBeCloseTo(0.613356, 5);
    expect(d1[1]).toBeCloseTo(0.789807, 5);
    expect(d1[2]).toBeUndefined();
    const d2 = transform(docs[1], model);
    expect(d2[0]).toBeCloseTo(0.508542, 5);
    expect(d2[2]).toBeCloseTo(0.861037, 5);
  });

  it("uses sublinear term frequency (1 + ln tf)", () => {
    const d3 = transform(docs[2], model);
    expect(d3[1] / d3[0]).toBeCloseTo(2.180235, 5);
  });

  it("L2-normalises vectors", () => {
    for (const d of docs) {
      const v = transform(d, model);
      expect(Object.values(v).reduce((s, w) => s + w * w, 0)).toBeCloseTo(1, 10);
    }
  });

  it("drops terms below minDf and ignores unknown terms", () => {
    const m = fit(docs, { minDf: 2 });
    expect([...m.vocab.keys()]).toEqual(["cat", "dog"]);
    expect(transform(["fish", "bird"], m)).toEqual({});
  });
});

describe("cosine", () => {
  const d1 = transform(docs[0], model);
  const d2 = transform(docs[1], model);

  it("matches the hand-computed value", () => {
    expect(cosine(d1, d2)).toBeCloseTo(0.311917, 5);
  });

  it("is symmetric, 1 for identical vectors and 0 for disjoint or empty ones", () => {
    expect(cosine(d1, d2)).toBeCloseTo(cosine(d2, d1), 12);
    expect(cosine(d1, d1)).toBeCloseTo(1, 12);
    expect(cosine({ 0: 1 }, { 1: 1 })).toBe(0);
    expect(cosine({}, d1)).toBe(0);
  });

  it("does not depend on vector length", () => {
    expect(cosine({ 0: 3, 1: 4 }, { 0: 6, 1: 8 })).toBeCloseTo(1, 12);
  });
});
