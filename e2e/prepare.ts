/**
 * Run (by playwright.config.ts) before the e2e server starts: create the e2e schema's tables, empty it, and load the
 * six fixture books plus three raters so "popular books" has data. Refuses any schema without "test" in its name.
 */
import { execSync } from "node:child_process";
import { e2eDatabaseUrl } from "./database";

async function main() {
  const url = e2eDatabaseUrl();
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  // Imported after DATABASE_URL is set: server/db creates the Prisma client on import.
  const { prisma } = await import("../server/db");
  const { createPatron, resetDb, seedFixtureBooks } = await import("../tests/helpers");
  await resetDb();
  const books = await seedFixtureBooks();
  const raters = [
    [5, 4, 3, 2, 4, 5],
    [4, 5, 2, 3, 5, 4],
    [5, 5, 4, 1, 3, 4],
  ];
  for (const [i, ratings] of raters.entries()) {
    const reader = await createPatron(`reader${i}@example.com`);
    await prisma.interaction.createMany({
      data: ratings.map((ratingValue, b) => ({ userId: reader.id, bookId: books[b].id, type: "RATE" as const, ratingValue })),
    });
  }
  await prisma.$disconnect();
  console.log(`e2e schema ready: ${books.length} books, ${raters.length} raters`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
