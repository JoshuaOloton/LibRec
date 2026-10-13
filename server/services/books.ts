import { buildContentText } from "@/lib/content-text";
import type { BookInput } from "@/lib/book-schema";
import { prisma } from "@/server/db";
import { regenerateAllFeatures } from "@/server/services/features";
import { invalidateRecommenderCache } from "@/server/services/recommender-cache";

export const ADMIN_PAGE_SIZE = 25;

const bookDetailSelect = {
  id: true,
  title: true,
  author: true,
  genres: true,
  description: true,
  publicationYear: true,
  isbn: true,
  coverUrl: true,
} as const;

export function getBook(id: number) {
  return prisma.book.findUnique({ where: { id }, select: bookDetailSelect });
}

/** Refit every BookFeature row, then drop the live recommender cache so it reloads the new vectors. */
async function refit() {
  await regenerateAllFeatures(prisma);
  invalidateRecommenderCache();
}

/** FR10: add a book, then refit TF-IDF so it gets a BookFeature row (and the vocabulary stays consistent). */
export async function createBook(input: BookInput) {
  const book = await prisma.book.create({
    data: { ...input, contentText: buildContentText(input) },
    select: { id: true },
  });
  await refit();
  return book;
}

/** FR10 / TC12: update a book and regenerate its BookFeature (the refit rewrites every row; see DECISIONS.md). */
export async function updateBook(id: number, input: BookInput) {
  const book = await prisma.book.update({
    where: { id },
    data: { ...input, contentText: buildContentText(input) },
    select: { id: true },
  });
  await refit();
  return book;
}

/** FR10: remove a book. Its feature row and interactions cascade; the vocabulary is refit without it. */
export async function deleteBook(id: number) {
  await prisma.book.delete({ where: { id } });
  await refit();
}

/** Admin table: any title/author match, with interaction counts. */
export async function listBooksForAdmin({ q, page = 1 }: { q?: string; page?: number }) {
  const text = q?.trim();
  const where = text
    ? {
        OR: [
          { title: { contains: text, mode: "insensitive" as const } },
          { author: { contains: text, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [total, books] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.findMany({
      where,
      orderBy: [{ title: "asc" }, { id: "asc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: { id: true, title: true, author: true, genres: true, publicationYear: true, _count: { select: { interactions: true } } },
    }),
  ]);
  return { books, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export function countBookInteractions(id: number) {
  return prisma.interaction.count({ where: { bookId: id } });
}
