import type { PrismaClient } from "@prisma/client";
import { tokenise } from "@/lib/recommender/text";
import { fit, transform } from "@/lib/recommender/tfidf";

const BATCH = 500;

/**
 * Refit the vocabulary/IDF over every book's contentText and rewrite all BookFeature rows.
 * There is no vocabulary table (the schema keeps exactly five entities); the vocabulary is rebuilt
 * deterministically from Book.contentText, so any process can reproduce it. TC12 reuses this after an admin edit.
 */
export async function regenerateAllFeatures(db: PrismaClient) {
  const books = await db.book.findMany({ select: { id: true, contentText: true }, orderBy: { id: "asc" } });
  const tokens = books.map((b) => tokenise(b.contentText));
  const model = fit(tokens);
  const generatedAt = new Date();

  const rows = books.map((b, i) => ({
    bookId: b.id,
    tfidfVector: transform(tokens[i], model) as Record<string, number>,
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
