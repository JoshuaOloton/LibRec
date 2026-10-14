// Shared by prisma/seed.ts and prisma/reset-demo.ts, so the reset restores exactly what the seed created.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import type { Prisma } from "@prisma/client";

const DIR = resolve(process.cwd(), "data/processed");
export const SEED = 42;

export const DEMO_PASSWORD = "demo1234";
export const DEMO_COLD = { name: "Demo Cold-start Patron", email: "cold@librec.demo" };
export const DEMO_HEAVY = { name: "Demo Heavy Reader", email: "heavy@librec.demo" };
const HEAVY_BOOKS = 28;

function readCsv(file: string): Record<string, string>[] {
  return parse(readFileSync(resolve(DIR, file)), { columns: true, skip_empty_lines: true });
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BookRow = Omit<Prisma.BookCreateManyInput, "genres"> & { id: number; genres: string[] };

export function loadBooks(): BookRow[] {
  return readCsv("books_clean.csv").map((r) => ({
    id: Number(r.book_id),
    title: r.title,
    author: r.author,
    genres: r.genres ? r.genres.split("|") : [],
    description: r.description || null,
    publicationYear: r.publication_year ? Math.trunc(Number(r.publication_year)) : null,
    isbn: r.isbn || null,
    coverUrl: r.cover_url || null,
    contentText: r.content_text,
  }));
}

export function loadInteractions(bookIds: Set<number>) {
  const rows = readCsv("interactions_clean.csv").map((r) => ({
    userId: Number(r.user_id),
    bookId: Number(r.book_id),
    type: r.type as "BORROW" | "RATE",
    ratingValue: r.rating_value === "" ? null : Number(r.rating_value),
    timestamp: new Date(r.timestamp),
    simulated: r.simulated === "True",
  }));
  for (const r of rows) {
    if (!bookIds.has(r.bookId)) throw new Error(`interaction references unknown book ${r.bookId}`);
    if ((r.type === "RATE") !== (r.ratingValue !== null)) throw new Error(`rating_value/type mismatch: ${JSON.stringify(r)}`);
  }
  return rows;
}

/** Deterministic demo histories built from the same catalogue: popularity = number of ratings in the dataset. */
export function buildDemoHistories(books: BookRow[], interactions: ReturnType<typeof loadInteractions>) {
  const rng = mulberry32(SEED);
  const popularity = new Map<number, number>();
  for (const i of interactions) if (i.type === "RATE") popularity.set(i.bookId, (popularity.get(i.bookId) ?? 0) + 1);
  const byPopularity = (genre: string) =>
    books
      .filter((b) => b.genres.includes(genre))
      .sort((a, b) => (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0) || a.id - b.id);

  const day = 86_400_000;
  const t0 = Date.UTC(2025, 5, 30); // just after the dataset window (2024-09-02 .. 2025-06-27)
  const at = (n: number) => new Date(t0 + n * day);

  // Cold-start: exactly 2 distinct books (one borrow, one rating).
  const cold = [
    { bookId: byPopularity("science-fiction")[0].id, type: "BORROW" as const, ratingValue: null, timestamp: at(0) },
    { bookId: byPopularity("mystery")[0].id, type: "RATE" as const, ratingValue: 5, timestamp: at(1) },
  ];

  // Heavy reader: 28 distinct popular fantasy / young-adult books, rated 3-5.
  const pool = [...byPopularity("fantasy").slice(0, 40), ...byPopularity("young-adult").slice(0, 40)];
  const picked = [...new Map(pool.map((b) => [b.id, b])).values()].slice(0, HEAVY_BOOKS);
  if (picked.length < HEAVY_BOOKS) throw new Error("not enough books for the heavy demo reader");
  const heavy = picked.map((b, n) => ({
    bookId: b.id,
    type: "RATE" as const,
    ratingValue: 3 + Math.floor(rng() * 3),
    timestamp: at(n),
  }));
  return { cold, heavy };
}
