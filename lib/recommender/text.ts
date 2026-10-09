import { stemmer } from "stemmer";

// Standard English stopword list (NLTK-style). Kept inline so the engine has no data files.
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a about above after again against all am an and any are aren as at be because been before being below between both " +
    "but by can cannot could couldn did didn do does doesn doing don down during each few for from further had hadn has " +
    "hasn have haven having he her here hers herself him himself his how i if in into is isn it its itself just let ll " +
    "me more most mustn my myself no nor not now of off on once only or other ought our ours ourselves out over own re " +
    "same shan she should shouldn so some such than that the their theirs them themselves then there these they this " +
    "those through to too under until up ve very was wasn we were weren what when where which while who whom why will " +
    "with won would wouldn you your yours yourself yourselves s t d m o y"
  ).split(" "),
);

/** Lowercase, split on non-letters/digits, drop stopwords, short tokens and pure numbers, then stem. */
export function tokenise(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || /^\d+$/.test(raw) || STOPWORDS.has(raw)) continue;
    out.push(stemmer(raw));
  }
  return out;
}
