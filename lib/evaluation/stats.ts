/**
 * Significance tests for the evaluation (DECISIONS 2026-10-13, Q6): Wilcoxon signed-rank on per-patron differences and
 * a paired t-test on seed means. Hand-written, with no dependencies, like the rest of the engine; the tests check
 * every function against a hand-computed example and against scipy.
 */

const EPS = 1e-15;
const FPMIN = 1e-300;

/** ln Gamma(x) for x > 0 (Lanczos, g = 7). */
export function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised upper incomplete gamma Q(a, x) (series below a + 1, continued fraction above). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const lg = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * EPS) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lg);
  }
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lg) * h;
}

/** Complementary error function for x >= 0, accurate in the far tail (erfc(x) = Q(1/2, x^2)). */
export function erfc(x: number): number {
  return x < 0 ? 2 - erfc(-x) : gammaQ(0.5, x * x);
}

/** Two-sided p-value of a standard normal statistic. */
export function normalTwoSidedP(z: number): number {
  return erfc(Math.abs(z) / Math.SQRT2);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaCf(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betaCf(x, a, b)) / a : 1 - (bt * betaCf(1 - x, b, a)) / b;
}

/** Two-sided p-value of a Student t statistic with `df` degrees of freedom. */
export function studentTwoSidedP(t: number, df: number): number {
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

export interface WilcoxonResult {
  /** Pairs with a non-zero difference (the only ones that are ranked). */
  n: number;
  /** Pairs whose difference was exactly zero, dropped before ranking. */
  zeros: number;
  /** Sum of the ranks of the positive differences (first sample better) and of the negative ones. */
  wPlus: number;
  wMinus: number;
  /** Normal-approximation z (tie-corrected variance, continuity-corrected), for W+ against its mean. */
  z: number;
  /** Two-sided p-value. */
  p: number;
  /** Matched-pairs rank-biserial correlation (W+ - W-) / (n(n+1)/2), in [-1, 1]; positive favours the first sample. */
  rankBiserial: number;
  /** Mean of all differences, zeros included. */
  meanDiff: number;
}

/**
 * Wilcoxon signed-rank test on paired differences d = (first - second).
 * Zeros are dropped, |d| is ranked with average ranks for ties, and W+ is compared with its null mean n(n+1)/4 using
 *   var = n(n+1)(2n+1)/24 - sum(t^3 - t)/48   (t = size of each group of tied |d|)
 *   z = (W+ - mean - 0.5 sign(W+ - mean)) / sqrt(var)
 * p is two-sided. The normal approximation is the one to use here (thousands of pairs, heavy ties); for fewer than
 * about 20 pairs without ties an exact table would be needed instead.
 */
export function wilcoxonSignedRank(diffs: number[]): WilcoxonResult {
  const nonZero = diffs.filter((d) => d !== 0);
  const n = nonZero.length;
  const meanDiff = diffs.length === 0 ? NaN : diffs.reduce((s, d) => s + d, 0) / diffs.length;
  if (n === 0) {
    return { n: 0, zeros: diffs.length, wPlus: 0, wMinus: 0, z: NaN, p: NaN, rankBiserial: NaN, meanDiff };
  }

  const order = nonZero.map((d, i) => ({ abs: Math.abs(d), pos: d > 0, i })).sort((a, b) => a.abs - b.abs);
  const ranks = new Array<number>(n);
  let tieTerm = 0;
  for (let start = 0; start < n; ) {
    let end = start;
    while (end + 1 < n && order[end + 1].abs === order[start].abs) end++;
    const avgRank = (start + end) / 2 + 1; // ranks are 1-based
    for (let k = start; k <= end; k++) ranks[k] = avgRank;
    const t = end - start + 1;
    tieTerm += t ** 3 - t;
    start = end + 1;
  }

  let wPlus = 0;
  let wMinus = 0;
  order.forEach((o, k) => (o.pos ? (wPlus += ranks[k]) : (wMinus += ranks[k])));

  const mean = (n * (n + 1)) / 4;
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieTerm / 48;
  const shift = wPlus - mean;
  const z = variance > 0 ? (shift - 0.5 * Math.sign(shift)) / Math.sqrt(variance) : NaN;
  return {
    n,
    zeros: diffs.length - n,
    wPlus,
    wMinus,
    z,
    p: Number.isNaN(z) ? NaN : normalTwoSidedP(z),
    rankBiserial: (wPlus - wMinus) / ((n * (n + 1)) / 2),
    meanDiff,
  };
}

export interface PairedTResult {
  n: number;
  meanDiff: number;
  /** Sample standard deviation (n - 1) of the differences. */
  sd: number;
  t: number;
  df: number;
  /** Two-sided p-value. */
  p: number;
  /** Cohen's d_z: the mean difference in units of its own standard deviation. */
  dz: number;
}

/** Paired t-test on differences d = (first - second): t = mean / (sd / sqrt(n)), df = n - 1. */
export function pairedT(diffs: number[]): PairedTResult {
  const n = diffs.length;
  const meanDiff = diffs.reduce((s, d) => s + d, 0) / n;
  const sd = n < 2 ? NaN : Math.sqrt(diffs.reduce((s, d) => s + (d - meanDiff) ** 2, 0) / (n - 1));
  const t = meanDiff / (sd / Math.sqrt(n));
  const df = n - 1;
  // sd = 0: identical differences. Every difference equals the mean, so t is infinite (or 0/0 when the mean is 0).
  const p = n < 2 ? NaN : sd === 0 ? (meanDiff === 0 ? 1 : 0) : studentTwoSidedP(t, df);
  return { n, meanDiff, sd, t, df, p, dz: meanDiff / sd };
}

/** Holm-Bonferroni adjusted p-values, returned in the order given. */
export function holmAdjust(ps: number[]): number[] {
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(ps.length);
  let running = 0;
  order.forEach(({ p, i }, k) => {
    running = Math.max(running, Math.min(1, (ps.length - k) * p));
    adjusted[i] = running;
  });
  return adjusted;
}
