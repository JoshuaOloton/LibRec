// Seed Postgres from data/processed/{books,interactions}_clean.csv, keeping the dataset ids.
// Usage: npx tsx prisma/seed.ts [--reset] [--dry-run]
//   --reset    TRUNCATE all five tables (and restart their sequences) before seeding
//   --dry-run  parse and validate the CSVs, print planned counts, touch no database
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  buildDemoHistories,
  DEMO_COLD,
  DEMO_HEAVY,
  DEMO_PASSWORD,
  loadBooks,
  loadInteractions,
} from "./demo-data";

process.loadEnvFile?.(".env");

const BATCH = 5000; // interactions have 6 columns: well under Postgres' 65,535 bind-parameter limit

async function main() {
  const reset = process.argv.includes("--reset");
  const dryRun = process.argv.includes("--dry-run");

  const books = loadBooks();
  const bookIds = new Set(books.map((b) => b.id));
  const interactions = loadInteractions(bookIds);
  const userIds = [...new Set(interactions.map((i) => i.userId))].sort((a, b) => a - b);
  const demo = buildDemoHistories(books, interactions);

  console.log(`CSV: ${books.length} books, ${userIds.length} users, ${interactions.length} interactions`);
  if (dryRun) {
    console.log(`demo: cold-start ${demo.cold.length} interactions, heavy reader ${demo.heavy.length} interactions`);
    console.log("dry run: no database touched");
    return;
  }

  const { prisma } = await import("../server/db");
  try {
    const existing = (await prisma.book.count()) + (await prisma.user.count());
    if (existing > 0 && !reset) throw new Error("database is not empty; rerun with --reset to truncate and reseed");
    if (reset) {
      await prisma.$executeRawUnsafe(
        "TRUNCATE recommendation_logs, book_features, interactions, books, users RESTART IDENTITY CASCADE",
      );
    }

    // Dataset users are not loginable: each gets a hash of a random secret nobody knows.
    const unusableHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    await prisma.book.createMany({ data: books });
    for (let i = 0; i < userIds.length; i += BATCH) {
      await prisma.user.createMany({
        data: userIds.slice(i, i + BATCH).map((id) => ({
          id,
          name: `Patron ${id}`,
          email: `user${id}@librec.test`,
          passwordHash: unusableHash,
        })),
      });
    }
    for (let i = 0; i < interactions.length; i += BATCH) {
      await prisma.interaction.createMany({ data: interactions.slice(i, i + BATCH) });
    }

    // Explicit ids were inserted, so move the sequences past them (see the bottom of docs/schema.sql).
    await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('users', 'user_id'), (SELECT MAX(user_id) FROM users))`;
    await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('books', 'book_id'), (SELECT MAX(book_id) FROM books))`;

    // Admin (from .env) and the two demo patrons get ids from the sequence, after the dataset users.
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
    await prisma.user.create({
      data: { name: "Administrator", email: ADMIN_EMAIL, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10), role: "ADMIN" },
    });
    const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    for (const [acct, history] of [[DEMO_COLD, demo.cold], [DEMO_HEAVY, demo.heavy]] as const) {
      await prisma.user.create({
        data: {
          ...acct,
          passwordHash: demoHash,
          interactions: { create: history.map((h) => ({ ...h, simulated: true })) },
        },
      });
    }

    const [b, u, inter, bf, rl] = await Promise.all([
      prisma.book.count(),
      prisma.user.count(),
      prisma.interaction.count(),
      prisma.bookFeature.count(),
      prisma.recommendationLog.count(),
    ]);
    const extraInteractions = demo.cold.length + demo.heavy.length;
    console.log("\nRow counts            actual   expected (cleaning_report.md + extras)");
    console.log(`books                 ${b}     ${books.length}`);
    console.log(`users                 ${u}     ${userIds.length} dataset + 1 admin + 2 demo = ${userIds.length + 3}`);
    console.log(`interactions          ${inter}    ${interactions.length} dataset + ${extraInteractions} demo = ${interactions.length + extraInteractions}`);
    console.log(`book_features         ${bf}        (filled by precompute-features.ts)`);
    console.log(`recommendation_logs   ${rl}        (empty until Cycle 4/5)`);

    console.log("\nDemo logins");
    console.log(`  cold-start patron  ${DEMO_COLD.email} / ${DEMO_PASSWORD}   (2 interactions)`);
    console.log(`  heavy reader       ${DEMO_HEAVY.email} / ${DEMO_PASSWORD}   (${demo.heavy.length} interactions)`);
    console.log(`  admin              ${ADMIN_EMAIL} / (ADMIN_PASSWORD from .env)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
