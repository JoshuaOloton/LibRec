import { buildHistory } from "@/lib/recommender/history";
import { topN } from "@/lib/recommender/ranking";
import type { HistoryItem } from "@/lib/recommender/types";
import { reasonText, type Reason } from "@/lib/reason";
import { genreLabel } from "@/lib/utils";
import { prisma } from "@/server/db";
import { getSnapshot, type BookMeta, type Snapshot } from "@/server/services/recommender-cache";

export const SHELF_SIZE = 10;
export const MORE_LIKE_THIS_SIZE = 6;

export type ServedSource = "CONTENT" | "COLLABORATIVE";

export interface ServedItem {
  book: BookMeta;
  reason: Reason;
  source: ServedSource;
  score: number;
  /** Position in the served list, from 1. */
  rank: number;
}

export type ShelfPath = "genres" | "content-only" | "weighted";

export type Shelf =
  /** Nothing to recommend from yet: the patron has no history and has picked no genres. */
  | { kind: "onboarding" }
  | {
      kind: "ready";
      path: ShelfPath;
      items: ServedItem[];
      /** Distinct books in the patron's history (0 on the genre path). */
      basedOn: number;
      /** Picked genres, on the genre path only. */
      genres: string[];
    };

/** The patron's history, one entry per distinct book (a rating wins over a borrow of the same book). */
export async function loadHistory(userId: number): Promise<HistoryItem[]> {
  const rows = await prisma.interaction.findMany({
    where: { userId },
    select: { bookId: true, type: true, ratingValue: true },
  });
  return buildHistory(rows);
}

/**
 * FR9 / TC11: one row per served item, written before the caller gets the list back.
 * `source` is the component that produced the item (the attribution rule), not the engine as a whole.
 */
async function logServed(userId: number, items: ServedItem[]) {
  if (items.length === 0) return;
  await prisma.recommendationLog.createMany({
    data: items.map((i) => ({
      userId,
      bookId: i.book.id,
      sourceComponent: i.source,
      score: i.score,
      rank: i.rank,
      reason: reasonText(i.reason),
    })),
  });
}

function interestReason(book: BookMeta, genres: string[] = []): Reason {
  const genre = genres.find((g) => book.genres.includes(g)) ?? book.genres[0] ?? "books like these";
  return { kind: "interest", genre: genreLabel(genre).toLowerCase() };
}

/** "Because you rated X" / "Similar to X you borrowed", where X is the patron's own book closest to the candidate. */
function contentReason(s: Snapshot, history: HistoryItem[], candidate: BookMeta): Reason {
  const closest = s.content.mostSimilarOwn(candidate.id, history.map((h) => h.bookId));
  const own = closest && s.books.get(closest.bookId);
  if (!closest || !own) return interestReason(candidate);
  const rated = history.find((h) => h.bookId === closest.bookId)?.ratingValue != null;
  return { kind: rated ? "rated" : "borrowed", book: own.title };
}

/**
 * Your shelf (FR6-FR9): the hybrid engine for a patron with history, the genre path for a brand-new patron who has
 * picked genres. The switching rule lives in the engine: below 3 distinct books it uses content only and never calls CF.
 * `pickedGenres` is only used while the patron has no history.
 */
export async function getShelf(userId: number, pickedGenres: string[] = [], n: number = SHELF_SIZE): Promise<Shelf> {
  const s = await getSnapshot();
  const history = await loadHistory(userId); // read once, before either component runs

  if (history.length === 0) {
    const genres = pickedGenres.filter((g) => s.genreBooks.has(g));
    if (genres.length === 0) return { kind: "onboarding" };
    const items = serveGenres(s, genres, n);
    await logServed(userId, items);
    return { kind: "ready", path: "genres", items, basedOn: 0, genres };
  }

  const path = s.engine.path(history);
  const recs = s.engine.recommend(history, n, { userId });
  const collabIds = recs.filter((r) => r.source === "COLLABORATIVE").map((r) => r.bookId);
  const neighbourRatings = collabIds.length ? s.collab.neighbourRatings(history, collabIds, { userId }) : new Map();

  const items: ServedItem[] = [];
  for (const r of recs) {
    const book = s.books.get(r.bookId);
    if (!book) continue;
    const source: ServedSource = r.source ?? "CONTENT";
    const given = neighbourRatings.get(r.bookId);
    const reason: Reason =
      source === "COLLABORATIVE" && given
        ? { kind: "similar-readers", stars: Math.min(5, Math.max(1, Math.round(given.mean))) }
        : contentReason(s, history, book);
    items.push({ book, reason, source, score: r.score, rank: items.length + 1 });
  }
  await logServed(userId, items);
  return { kind: "ready", path, items, basedOn: history.length, genres: [] };
}

/** Content-based picks from the centroid of the picked genres' books, limited to books that have a picked genre. */
function serveGenres(s: Snapshot, genres: string[], n: number): ServedItem[] {
  const groups = genres.map((g) => s.genreBooks.get(g) ?? []);
  const centroid = s.content.groupCentroid(groups);
  if (!centroid) return [];
  const inGenres = new Set(groups.flat());
  const scores = s.content.scoreProfile(centroid);
  for (const id of [...scores.keys()]) if (!inGenres.has(id)) scores.delete(id);

  const items: ServedItem[] = [];
  for (const r of topN(scores, n)) {
    const book = s.books.get(r.bookId);
    if (book) items.push({ book, reason: interestReason(book, genres), source: "CONTENT", score: r.score, rank: items.length + 1 });
  }
  return items;
}

/**
 * "More like this" on the book page: the books closest to this one by TF-IDF cosine. Signed-in patrons do not see
 * books they already have, and their list is logged (a logged-out visitor's cannot be: the log is keyed by patron).
 */
export async function getMoreLikeThis(bookId: number, userId: number | null, n: number = MORE_LIKE_THIS_SIZE): Promise<ServedItem[]> {
  const s = await getSnapshot();
  const here = s.books.get(bookId);
  if (!here) return [];
  const own = userId ? new Set((await loadHistory(userId)).map((h) => h.bookId)) : new Set<number>();

  const items: ServedItem[] = [];
  for (const r of s.content.similarTo(bookId, n + own.size)) {
    const book = s.books.get(r.bookId);
    if (!book || own.has(r.bookId)) continue;
    items.push({ book, reason: { kind: "similar-to", book: here.title }, source: "CONTENT", score: r.score, rank: items.length + 1 });
    if (items.length === n) break;
  }
  if (userId) await logServed(userId, items);
  return items;
}

/** Onboarding choices: the most common genres, and the books with the most raters. */
export async function getOnboardingChoices(genreCount = 24, bookCount = 8) {
  const s = await getSnapshot();
  const genres = [...s.genreBooks]
    .map(([slug, ids]) => ({ slug, count: ids.length }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
    .slice(0, genreCount);
  const popular = topN(s.collab.raterCounts(), bookCount)
    .map((r) => s.books.get(r.bookId))
    .filter((b): b is BookMeta => !!b);
  return { genres, popular };
}

/** Keep only picks that are real catalogue genres. */
export async function validGenres(picks: string[]): Promise<string[]> {
  const s = await getSnapshot();
  return [...new Set(picks)].filter((g) => s.genreBooks.has(g));
}
