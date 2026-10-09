// Fit TF-IDF over the catalogue and fill book_features.  Usage: npx tsx scripts/precompute-features.ts
import { prisma } from "../server/db";
import { regenerateAllFeatures } from "../server/services/features";

process.loadEnvFile?.(".env");

async function main() {
  const r = await regenerateAllFeatures(prisma);
  console.log(
    `book_features: ${r.books} rows, vocabulary ${r.vocabSize} terms, mean ${r.meanNonZeros.toFixed(1)} non-zero terms per book`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
