import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { genreLabel } from "@/lib/utils";

export const PAGE_SIZE = 24;

const bookSelect = { id: true, title: true, author: true, genres: true, coverUrl: true } as const;

/** Every genre in the catalogue with its book count, most common first. */
export const getGenres = cache(async () => {
  const rows = await prisma.$queryRaw<{ genre: string; count: bigint }[]>`
    SELECT g AS genre, COUNT(*) AS count FROM books, unnest(genres) AS g GROUP BY g ORDER BY count DESC, g`;
  return rows.map((r) => ({ genre: r.genre, count: Number(r.count) }));
});

export type CatalogueQuery = { q?: string; genre?: string; page?: number };

/**
 * Browse and search (FR2). One query box matches title or author (case-insensitive substring)
 * or a genre whose label contains the text; `genre` narrows to an exact genre.
 */
export async function searchBooks({ q, genre, page = 1 }: CatalogueQuery) {
  const text = q?.trim();
  const and: Prisma.BookWhereInput[] = [];

  if (text) {
    const needle = text.toLowerCase();
    const matchingGenres = (await getGenres())
      .map((g) => g.genre)
      .filter((g) => genreLabel(g).toLowerCase().includes(needle));
    and.push({
      OR: [
        { title: { contains: text, mode: "insensitive" } },
        { author: { contains: text, mode: "insensitive" } },
        ...(matchingGenres.length ? [{ genres: { hasSome: matchingGenres } }] : []),
      ],
    });
  }
  if (genre) and.push({ genres: { has: genre } });

  const where: Prisma.BookWhereInput = and.length ? { AND: and } : {};
  const [total, books] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.findMany({
      where,
      select: bookSelect,
      orderBy: [{ title: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { books, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
