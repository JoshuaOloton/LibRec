/** The "why" behind one recommendation (NFR1). Copy follows docs/STYLE.md. */
export type Reason =
  | { kind: "rated"; book: string }
  | { kind: "borrowed"; book: string }
  | { kind: "similar-to"; book: string }
  | { kind: "similar-readers"; stars: number }
  | { kind: "interest"; genre: string };

/** Plain-text form, stored in RecommendationLog.reason. The reason slip renders the same words with the title in italics. */
export function reasonText(r: Reason): string {
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
