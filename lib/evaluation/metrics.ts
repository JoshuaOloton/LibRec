export interface TopNMetrics {
  hits: number;
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Precision@N, Recall@N and F1@N for one patron. Precision divides by N (not by the list length), so a short list is
 * penalised. `relevant` must be non-empty: recall is undefined otherwise and such patrons are skipped by the runner.
 */
export function topNMetrics(recommended: number[], relevant: ReadonlySet<number>, n: number): TopNMetrics {
  let hits = 0;
  for (const id of recommended.slice(0, n)) if (relevant.has(id)) hits++;
  const precision = hits / n;
  const recall = hits / relevant.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { hits, precision, recall, f1 };
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample standard deviation (n - 1); 0 for a single value. */
export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
