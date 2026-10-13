/** Sparse vector: term index -> weight. Serialises directly to the BookFeature JSON column. */
export type SparseVector = Record<number, number>;

export interface TfidfOptions {
  /** Terms appearing in fewer documents than this are dropped (they can never match another book). */
  minDf: number;
}

export const DEFAULT_TFIDF_OPTIONS: TfidfOptions = { minDf: 2 };

export interface TfidfModel {
  /** term -> index. Indices are the rank in the alphabetically sorted vocabulary, so a refit is reproducible. */
  vocab: Map<string, number>;
  /** idf[index] = ln((1 + N) / (1 + df)) + 1 (smoothed) */
  idf: number[];
}

/** Fit vocabulary and IDF on tokenised documents. */
export function fit(docs: string[][], options: TfidfOptions = DEFAULT_TFIDF_OPTIONS): TfidfModel {
  const df = new Map<string, number>();
  for (const doc of docs) for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);

  const terms = [...df.keys()].filter((t) => df.get(t)! >= options.minDf).sort();
  const vocab = new Map(terms.map((t, i) => [t, i]));
  const n = docs.length;
  const idf = terms.map((t) => Math.log((1 + n) / (1 + df.get(t)!)) + 1);
  return { vocab, idf };
}

/** Cosine similarity of two sparse vectors; 0 when either is the zero vector. */
export function cosine(a: SparseVector, b: SparseVector): number {
  const [small, large] = Object.keys(a).length <= Object.keys(b).length ? [a, b] : [b, a];
  let dot = 0;
  for (const k of Object.keys(small)) {
    const w = large[Number(k)];
    if (w !== undefined) dot += small[Number(k)] * w;
  }
  const na = norm(a);
  const nb = norm(b);
  return na === 0 || nb === 0 ? 0 : dot / (na * nb);
}

export function norm(v: SparseVector): number {
  let s = 0;
  for (const k of Object.keys(v)) s += v[Number(k)] ** 2;
  return Math.sqrt(s);
}

/** Sublinear TF (1 + ln tf) x IDF, L2-normalised. Unknown terms are ignored. */
export function transform(tokens: string[], model: TfidfModel): SparseVector {
  const counts = new Map<number, number>();
  for (const t of tokens) {
    const i = model.vocab.get(t);
    if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  const vec: SparseVector = {};
  let sumSq = 0;
  for (const [i, c] of counts) {
    const w = (1 + Math.log(c)) * model.idf[i];
    vec[i] = w;
    sumSq += w * w;
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) for (const i of Object.keys(vec)) vec[Number(i)] /= norm;
  return vec;
}
