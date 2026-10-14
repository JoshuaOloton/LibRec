import { describe, expect, it } from "vitest";
import { createEvalConfigs } from "@/lib/evaluation/configs";
import { evaluateSeed, SEGMENTS, type EvalConfig } from "@/lib/evaluation/runner";
import { splitInteractions, type EvalInteraction } from "@/lib/evaluation/split";

// TC14 (FR12): run the three configurations (content, collaborative, hybrid) on one partition and get P/R/F1 for each
// under an identical protocol. This uses the real engines, built by the same factory as scripts/evaluate.ts.

const GENRES = ["fantasy", "science fiction", "mystery", "romance"];
const books = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  contentText: `${GENRES[i % 4]} ${GENRES[(i + 1) % 4]} story number ${i} about ${GENRES[i % 4]} adventure and ${GENRES[(i * 3) % 4]} mystery`,
}));

/** 30 patrons: ten with 3 books (cold after the split), twenty with 8-12 books (warm). Ratings are 4 or 5. */
function dataset(): EvalInteraction[] {
  const rows: EvalInteraction[] = [];
  for (let u = 1; u <= 30; u++) {
    const size = u <= 10 ? 3 : 8 + (u % 5);
    for (let k = 0; k < size; k++) {
      const bookId = ((u * 3 + k * 5) % 16) + 1;
      if (rows.some((r) => r.userId === u && r.bookId === bookId)) continue;
      rows.push({ userId: u, bookId, type: "RATE", ratingValue: 4 + ((u + k) % 2) });
    }
  }
  return rows;
}

function threeConfigs() {
  const { available } = createEvalConfigs(books);
  return [available.content, available.collab, available.hybrid];
}

describe("TC14 evaluation harness", () => {
  it("reports precision, recall and F1 for each of the three configurations", () => {
    const result = evaluateSeed(dataset(), 1, threeConfigs(), { n: 10 });
    expect(Object.keys(result.configs)).toEqual(["content", "collab", "hybrid"]);
    for (const name of ["content", "collab", "hybrid"]) {
      for (const seg of SEGMENTS) {
        const s = result.configs[name][seg];
        for (const metric of [s.precision, s.recall, s.f1]) {
          expect(Number.isFinite(metric)).toBe(true);
          expect(metric).toBeGreaterThanOrEqual(0);
          expect(metric).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("builds every configuration from the same training set and scores the same test patrons", () => {
    const interactions = dataset();
    const builtFrom: EvalInteraction[][] = [];
    const spied: EvalConfig[] = threeConfigs().map((c) => ({
      ...c,
      build: (train) => {
        builtFrom.push(train);
        return c.build(train);
      },
    }));
    const result = evaluateSeed(interactions, 2, spied, { n: 10 });

    // one training array, shared by all three, with none of the held-out rows in it
    expect(builtFrom).toHaveLength(3);
    expect(builtFrom[1]).toBe(builtFrom[0]);
    expect(builtFrom[2]).toBe(builtFrom[0]);
    const { train, test } = splitInteractions(interactions, 2);
    expect(builtFrom[0]).toEqual(train);
    const trainKeys = new Set(train.map((r) => `${r.userId}:${r.bookId}`));
    expect(test.some((r) => trainKeys.has(`${r.userId}:${r.bookId}`))).toBe(false);

    // the same patrons in the same cold / warm segments for every configuration
    for (const seg of SEGMENTS) {
      const users = ["content", "collab", "hybrid"].map((n) => result.configs[n][seg].users);
      expect(new Set(users).size).toBe(1);
      expect(users[0]).toBeGreaterThan(0);
    }
    expect(result.configs.content.cold.users).toBeGreaterThan(0); // the cold segment exists, so the switching rule is exercised
    expect(result.configs.content.warm.users).toBeGreaterThan(0);
  });

  it("is reproducible for a seed and uses a different partition for another seed", () => {
    const interactions = dataset();
    const a = evaluateSeed(interactions, 3, threeConfigs(), { n: 10 });
    const b = evaluateSeed(interactions, 3, threeConfigs(), { n: 10 });
    expect(b).toEqual(a);
    expect(splitInteractions(interactions, 4).test).not.toEqual(splitInteractions(interactions, 3).test);
  });

  it("the hybrid equals content-based filtering on the cold segment (the switching rule)", () => {
    const r = evaluateSeed(dataset(), 1, threeConfigs(), { n: 10 });
    expect(r.configs.hybrid.cold.f1).toBe(r.configs.content.cold.f1);
    expect(r.configs.hybrid.cold.precision).toBe(r.configs.content.cold.precision);
  });

  it("can return each patron's F1 per configuration, aligned for paired tests", () => {
    const r = evaluateSeed(dataset(), 1, threeConfigs(), { n: 10, collectPatrons: true });
    const p = r.patrons!;
    expect(p.userIds).toEqual([...p.userIds].sort((x, y) => x - y));
    for (const name of ["content", "collab", "hybrid"]) {
      expect(p.f1[name]).toHaveLength(p.userIds.length);
      const mean = p.f1[name].reduce((s, x) => s + x, 0) / p.userIds.length;
      expect(mean).toBeCloseTo(r.configs[name].all.f1, 12);
    }
    expect(p.cold.filter(Boolean).length).toBe(r.configs.content.cold.users);
    expect(evaluateSeed(dataset(), 1, threeConfigs(), { n: 10 }).patrons).toBeUndefined();
  });
});
