import { describe, expect, it } from "vitest";
import { STOPWORDS, tokenise } from "@/lib/recommender/text";

describe("tokenise", () => {
  it("lowercases, drops stopwords and stems", () => {
    expect(tokenise("The Running of the Wolves")).toEqual(["run", "wolv"]);
  });

  it("drops one-character tokens and pure numbers but keeps alphanumerics", () => {
    expect(tokenise("a b 1984 x2 2024")).toEqual(["x2"]);
  });

  it("strips accents and splits on punctuation", () => {
    expect(tokenise("Café-lait, naïve!")).toEqual(["cafe", "lait", "naiv"]);
  });

  it("returns nothing for empty or stopword-only text", () => {
    expect(tokenise("")).toEqual([]);
    expect(tokenise("the and of")).toEqual([]);
  });

  it("has the common English stopwords", () => {
    for (const w of ["the", "and", "of", "is", "to"]) expect(STOPWORDS.has(w)).toBe(true);
  });
});
