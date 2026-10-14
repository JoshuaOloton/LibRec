/** The "why" behind one recommendation (NFR1). Copy follows docs/STYLE.md. */
export type Reason =
  | { kind: "rated"; book: string }
  | { kind: "borrowed"; book: string }
  | { kind: "similar-to"; book: string }
  | { kind: "similar-readers"; stars: number }
  | { kind: "interest"; genre: string };

/** Weighted-path items whose CF prediction is at least this get the second line (DECISIONS 2026-10-13). */
export const ALSO_RATED_MIN = 4.0;

/** "Readers with similar taste also rated this 4.3★": the CF prediction, one decimal, shown at most 5.0. */
export function alsoRatedText(prediction: number): string {
  return `Readers with similar taste also rated this ${Math.min(5, prediction).toFixed(1)}★`;
}

/**
 * Plain-text form, stored in RecommendationLog.reason: the main reason, then the second line when there is one.
 * The reason slip renders the same words with the title in italics.
 */
export function reasonText(r: Reason, alsoRated?: number): string {
  const main = mainText(r);
  return alsoRated === undefined ? main : `${main}\n${alsoRatedText(alsoRated)}`;
}

function mainText(r: Reason): string {
  switch (r.kind) {
    case "rated":
      return `Because you rated ${r.book}`;
    case "borrowed":
      return `Similar to ${r.book} you borrowed`;
    case "similar-to":
      return `Similar to ${r.book}`;
    case "similar-readers":
      return `Readers with similar taste rated this ${r.stars}★`;
    case "interest":
      return `Matches your interest in ${r.genre}`;
  }
}
