import { describe, expect, it } from "vitest";
import {
  erfc,
  holmAdjust,
  incompleteBeta,
  normalTwoSidedP,
  pairedT,
  studentTwoSidedP,
  wilcoxonSignedRank,
} from "@/lib/evaluation/stats";

// Reference values marked "scipy" were computed with scipy 1.17 (scipy.stats.wilcoxon / ttest_1samp / norm / t).

describe("wilcoxonSignedRank", () => {
  // Textbook example: differences 15, -7, 5, 20, 0, -9, 17, -12, 9, 2.
  // The zero is dropped, leaving n = 9. |d| sorted: 2 5 7 9 9 12 15 17 20 -> ranks 1 2 3 4.5 4.5 6 7 8 9
  //   (the two 9s tie for ranks 4 and 5, so each gets 4.5).
  // W+ = ranks of +15 +5 +20 +17 +9 +2 = 7 + 2 + 9 + 8 + 4.5 + 1 = 31.5
  // W- = ranks of -7 -9 -12             = 3 + 4.5 + 6                = 13.5   (W+ + W- = 45 = 9 * 10 / 2)
  // mean = 9 * 10 / 4 = 22.5; var = 9 * 10 * 19 / 24 - (2^3 - 2) / 48 = 71.25 - 0.125 = 71.125 (sd 8.4335)
  // z = (31.5 - 22.5 - 0.5) / 8.4335 = 1.0079 (scipy reports -1.0079 for the smaller sum 13.5: same size)
  // p = 2 * (1 - Phi(1.0079)) = 0.3135;  rank-biserial = (31.5 - 13.5) / 45 = 0.4
  const diffs = [15, -7, 5, 20, 0, -9, 17, -12, 9, 2];

  it("matches the hand-computed ranks, z and effect size", () => {
    const r = wilcoxonSignedRank(diffs);
    expect(r.n).toBe(9);
    expect(r.zeros).toBe(1);
    expect(r.wPlus).toBe(31.5);
    expect(r.wMinus).toBe(13.5);
    expect(r.z).toBeCloseTo(8.5 / Math.sqrt(71.125), 12);
    expect(r.rankBiserial).toBeCloseTo(0.4, 12);
    expect(r.meanDiff).toBeCloseTo(4, 12); // (15 - 7 + 5 + 20 + 0 - 9 + 17 - 12 + 9 + 2) / 10 = 40 / 10
  });

  it("agrees with scipy on the p-value (zero_method='wilcox', correction=True, approx)", () => {
    expect(wilcoxonSignedRank(diffs).p).toBeCloseTo(0.3135132343764383, 9);
  });

  it("flips the sign of z and the effect size when the samples are swapped, and keeps p", () => {
    const a = wilcoxonSignedRank(diffs);
    const b = wilcoxonSignedRank(diffs.map((d) => -d));
    expect(b.z).toBeCloseTo(-a.z, 12);
    expect(b.rankBiserial).toBeCloseTo(-a.rankBiserial, 12);
    expect(b.p).toBeCloseTo(a.p, 12);
  });

  it("agrees with scipy on a larger sample with many ties and zeros (60 pairs)", () => {
    // 58 non-zero differences; scipy: W- = 657.5, p = 0.12589394186483818; W+ = 1053.5, rank-biserial 0.23144360023378
    const d = [0.5, 1.0, 0.5, -1.1, 1.1, 0.6, -0.3, 0.8, 0.6, 0.5, 0.2, 0.7, -0.5, 0.0, -0.3, 0.8, 0.2, -0.1, -0.6, -0.1,
      0.2, -0.1, 1.5, 1.2, -2.5, -1.7, 0.0, -0.2, 0.4, 0.4, 2.3, -0.9, -0.2, 2.2, 0.8, 0.9, -0.3, -1.4, 0.4, 0.3, -1.0,
      -0.5, 0.1, -0.7, 0.1, 0.3, 0.2, -0.3, 0.8, 1.1, 0.5, -0.6, 0.9, -0.3, 1.1, -0.9, 1.1, 0.2, -1.0, -0.1];
    const r = wilcoxonSignedRank(d);
    expect(r.n).toBe(58);
    expect(r.wPlus).toBe(1053.5);
    expect(r.wMinus).toBe(657.5);
    expect(r.rankBiserial).toBeCloseTo(0.2314436002337814, 12);
    expect(r.p).toBeCloseTo(0.12589394186483818, 8);
  });

  it("gives no result when every difference is zero", () => {
    const r = wilcoxonSignedRank([0, 0, 0]);
    expect(r.n).toBe(0);
    expect(Number.isNaN(r.p)).toBe(true);
  });
});

describe("pairedT", () => {
  // d = 1 2 3 4 5: mean 3, sample sd sqrt(10 / 4) = 1.5811, se = 1.5811 / sqrt(5) = 0.7071,
  // t = 3 / 0.7071 = 4.2426 on 4 df, d_z = 3 / 1.5811 = 1.8974; two-sided p = 0.013236 (scipy).
  it("matches the hand-computed t, effect size and scipy's p-value", () => {
    const r = pairedT([1, 2, 3, 4, 5]);
    expect(r.df).toBe(4);
    expect(r.meanDiff).toBe(3);
    expect(r.sd).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(r.t).toBeCloseTo(3 / (Math.sqrt(2.5) / Math.sqrt(5)), 12);
    expect(r.t).toBeCloseTo(4.242640687119285, 12);
    expect(r.dz).toBeCloseTo(1.8973665961010275, 12);
    expect(r.p).toBeCloseTo(0.01323559956368269, 10);
  });

  it("agrees with scipy on a small mixed-sign example (5 seed-sized differences)", () => {
    const r = pairedT([0.0021, 0.0034, -0.0005, 0.0027, 0.0018]);
    expect(r.t).toBeCloseTo(2.8807725655998326, 10);
    expect(r.p).toBeCloseTo(0.044978139739628484, 10);
    expect(r.dz).toBeCloseTo(1.2883206568795396, 10);
  });

  it("handles identical differences without dividing by zero", () => {
    expect(pairedT([0, 0, 0]).p).toBe(1);
    expect(pairedT([0.5, 0.5, 0.5]).p).toBe(0);
  });
});

describe("distribution functions", () => {
  it("normal tail matches scipy, including far into the tail", () => {
    expect(normalTwoSidedP(1.0078)).toBeCloseTo(0.31355048591025303, 9);
    expect(normalTwoSidedP(0)).toBeCloseTo(1, 12);
    expect(normalTwoSidedP(5.5) / 3.797912493177536e-8).toBeCloseTo(1, 6);
    expect(normalTwoSidedP(12) / 3.552964224155308e-33).toBeCloseTo(1, 6);
    expect(erfc(0)).toBeCloseTo(1, 14);
    expect(erfc(-1)).toBeCloseTo(1 + 0.8427007929497149, 12);
  });

  it("Student t tail matches scipy", () => {
    expect(studentTwoSidedP(2.5, 4)).toBeCloseTo(0.06676654481198814, 10);
    expect(studentTwoSidedP(10, 30) / 4.575251408229619e-11).toBeCloseTo(1, 6);
    expect(studentTwoSidedP(0, 4)).toBeCloseTo(1, 12);
  });

  it("incomplete beta has the known closed forms I_x(1, 1) = x and I_x(2, 1) = x^2", () => {
    expect(incompleteBeta(0.3, 1, 1)).toBeCloseTo(0.3, 12);
    expect(incompleteBeta(0.3, 2, 1)).toBeCloseTo(0.09, 12);
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
  });
});

describe("holmAdjust", () => {
  it("multiplies the sorted p-values by m, m - 1, ... and keeps them non-decreasing", () => {
    // sorted 0.01, 0.02, 0.04 -> 3 * 0.01 = 0.03, 2 * 0.02 = 0.04, 1 * 0.04 = 0.04
    expect(holmAdjust([0.04, 0.01, 0.02])).toEqual([expect.closeTo(0.04, 12), expect.closeTo(0.03, 12), expect.closeTo(0.04, 12)]);
    // sorted 0.5, 0.6 -> 2 * 0.5 = 1, then max(1, 1 * 0.6) = 1: an adjusted p never decreases down the sorted list
    expect(holmAdjust([0.6, 0.5])).toEqual([1, 1]);
  });
});
