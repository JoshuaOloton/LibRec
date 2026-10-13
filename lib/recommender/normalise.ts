/**
 * Min-max scale per request: the lowest score maps to 0 and the highest to 1.
 * When every score is equal there is no spread to scale, so all map to 0.
 */
export function minMax(scores: Map<number, number>): Map<number, number> {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of scores.values()) {
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  const out = new Map<number, number>();
  for (const [id, s] of scores) out.set(id, hi > lo ? (s - lo) / (hi - lo) : 0);
  return out;
}

/** Clamp to [lo, hi], then map linearly onto [0, 1]. */
export function clampScale(value: number, lo: number, hi: number): number {
  return (Math.min(hi, Math.max(lo, value)) - lo) / (hi - lo);
}

/** Predicted ratings live on the 1-5 rating scale. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;
