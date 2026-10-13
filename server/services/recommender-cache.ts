import { CollaborativeRecommender } from "@/lib/recommender/collaborative";
import { ContentRecommender } from "@/lib/recommender/content";
import { HybridEngine } from "@/lib/recommender/hybrid";
import type { SparseVector } from "@/lib/recommender/tfidf";
import { prisma } from "@/server/db";

export interface BookMeta {
  id: number;
  title: string;
  author: string;
  genres: string[];
  coverUrl: string | null;
}

/** Everything the live recommender needs, fitted once and kept in memory (DECISIONS 2026-10-13). */
export interface Snapshot {
  content: ContentRecommender;
  collab: CollaborativeRecommender;
  engine: HybridEngine;
  books: Map<number, BookMeta>;
  /** genre slug -> ids of the books that have it. */
  genreBooks: Map<string, number[]>;
}

const globalForCache = globalThis as unknown as { librecSnapshot?: Promise<Snapshot> | null };

async function build(): Promise<Snapshot> {
  const [features, ratings, bookRows] = await Promise.all([
    prisma.bookFeature.findMany({ select: { bookId: true, tfidfVector: true } }),
    prisma.interaction.findMany({
      where: { type: "RATE", ratingValue: { not: null } },
      select: { userId: true, bookId: true, ratingValue: true },
    }),
    prisma.book.findMany({ select: { id: true, title: true, author: true, genres: true, coverUrl: true } }),
  ]);

  const vectors = new Map<number, SparseVector>(features.map((f) => [f.bookId, f.tfidfVector as SparseVector]));
  const content = new ContentRecommender(vectors);
  const collab = new CollaborativeRecommender(
    ratings.map((r) => ({ userId: r.userId, bookId: r.bookId, ratingValue: r.ratingValue! })),
  );
  const engine = new HybridEngine(content, collab);

  const books = new Map(bookRows.map((b) => [b.id, b]));
  const genreBooks = new Map<string, number[]>();
  for (const b of bookRows) {
    for (const g of b.genres) {
      const list = genreBooks.get(g);
      if (list) list.push(b.id);
      else genreBooks.set(g, [b.id]);
    }
  }
  return { content, collab, engine, books, genreBooks };
}

/** The fitted models. Built on first use; concurrent callers share one build. A failed build is not cached. */
export function getSnapshot(): Promise<Snapshot> {
  if (!globalForCache.librecSnapshot) {
    const pending = build();
    globalForCache.librecSnapshot = pending;
    pending.catch(() => {
      if (globalForCache.librecSnapshot === pending) globalForCache.librecSnapshot = null;
    });
  }
  return globalForCache.librecSnapshot;
}

/**
 * Drop the cache after the catalogue changes (admin add / edit / delete refits every TF-IDF vector), so the next
 * request rebuilds from the new BookFeature rows.
 */
export function invalidateRecommenderCache(): void {
  globalForCache.librecSnapshot = null;
}

/**
 * Keep the collaborative index current when a patron rates a book, without refitting anything. If the cache is
 * still building, the update is applied once it finishes (it is idempotent, so a rating the build already saw is fine).
 * Borrows need no update: a patron's own history is read from the database per request, and borrows never enter CF.
 */
export function noteRating(userId: number, bookId: number, value: number): void {
  const pending = globalForCache.librecSnapshot;
  if (!pending) return; // not built yet: the first build reads the rating from the database
  void pending.then((s) => s.collab.upsertRating(userId, bookId, value)).catch(() => {});
}
