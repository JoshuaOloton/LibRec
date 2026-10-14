// Restore cold@librec.demo and heavy@librec.demo to the state prisma/seed.ts gave them, and clear their
// recommendation logs. Touches nothing else. Usage: npm run db:reset-demo
import bcrypt from "bcryptjs";
import { buildDemoHistories, DEMO_COLD, DEMO_HEAVY, DEMO_PASSWORD, loadBooks, loadInteractions } from "./demo-data";

process.loadEnvFile?.(".env");

async function main() {
  const books = loadBooks();
  const demo = buildDemoHistories(books, loadInteractions(new Set(books.map((b) => b.id))));

  const { prisma } = await import("../server/db");
  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    for (const [acct, history] of [[DEMO_COLD, demo.cold], [DEMO_HEAVY, demo.heavy]] as const) {
      const user = await prisma.user.upsert({
        where: { email: acct.email },
        create: { ...acct, passwordHash },
        update: { name: acct.name, passwordHash, role: "PATRON" },
      });
      const [logs, interactions] = await prisma.$transaction([
        prisma.recommendationLog.deleteMany({ where: { userId: user.id } }),
        prisma.interaction.deleteMany({ where: { userId: user.id } }),
        prisma.interaction.createMany({ data: history.map((h) => ({ ...h, userId: user.id, simulated: true })) }),
      ]);
      console.log(`${acct.email}: removed ${interactions.count} interactions and ${logs.count} log rows, restored ${history.length} interactions`);
    }
    console.log("\nIf the app is running, restart it: the live recommender cache still holds the old ratings.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
