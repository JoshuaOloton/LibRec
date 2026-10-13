import type { PrismaClient } from "@prisma/client";
import { buildItemVectors } from "@/lib/recommender/content";

const BATCH = 500;

/**
 * Refit the vocabulary/IDF over every book's contentText and rewrite all BookFeature rows.
 * There is no vocabulary table (the schema keeps exactly five entities); the vocabulary is rebuilt
 * deterministically from Book.contentText, so any process can reproduce it. TC12 reuses this after an admin edit.
 */
export async function regenerateAllFeatures(db: PrismaClient) {
  const books = await db.book.findMany({ select: { id: true, contentText: true }, orderBy: { id: "asc" } });
  const { model, vectors } = buildItemVectors(books);
  const generatedAt = new Date();

  const rows = books.map((b) => ({
    bookId: b.id,
    tfidfVector: vectors.get(b.id)! as Record<string, number>,
    generatedAt,
  }));

  await db.$transaction(
    async (tx) => {
      await tx.bookFeature.deleteMany();
      for (let i = 0; i < rows.length; i += BATCH) await tx.bookFeature.createMany({ data: rows.slice(i, i + BATCH) });
    },
    { timeout: 120_000 },
  );

  const nnz = rows.reduce((s, r) => s + Object.keys(r.tfidfVector).length, 0);
  return { books: books.length, vocabSize: model.vocab.size, meanNonZeros: nnz / Math.max(rows.length, 1) };
}
