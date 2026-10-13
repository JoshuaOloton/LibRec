import { buildContentText } from "@/lib/content-text";
import { prisma } from "@/server/db";
import { regenerateAllFeatures } from "@/server/services/features";

/** Empty every table (the test schema only). Children first so foreign keys never block. */
export async function resetDb() {
  // Last line of defence against wiping real data.
  if (!/[?&]schema=[^&]*test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("resetDb() only runs against a test schema.");
  }
  await prisma.recommendationLog.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.bookFeature.deleteMany();
  await prisma.book.deleteMany();
  await prisma.user.deleteMany();
}

export const FIXTURE_BOOKS = [
  { title: "The Dragon Keeper", author: "Ada Okoro", genres: ["fantasy", "young-adult"], description: "A young wizard raises a dragon on the coast." },
  { title: "Wizard of the Coast", author: "Chinedu Eze", genres: ["fantasy"], description: "A tired wizard guards a harbour town from sea dragons." },
  { title: "Orbital Decay", author: "Ngozi Bello", genres: ["science-fiction"], description: "A station crew races a failing orbit around a dying planet." },
  { title: "Lagos Nights", author: "Tunde Ajayi", genres: ["contemporary-fiction"], description: "Four friends cross a restless city after dark." },
  { title: "Starship Mathematics", author: "Ada Okoro", genres: ["science-fiction", "non-fiction"], description: "How navigators compute an orbit between planets." },
  { title: "Kitchen Chemistry", author: "Funmi Ade", genres: ["non-fiction"], description: "The science of cooking, explained one recipe at a time." },
];

/** Insert the fixture books and fit their TF-IDF features, like the seed does. Returns them in order. */
export async function seedFixtureBooks() {
  const books = [];
  for (const b of FIXTURE_BOOKS) {
    books.push(await prisma.book.create({ data: { ...b, contentText: buildContentText(b) } }));
  }
  await regenerateAllFeatures(prisma);
  return books;
}

export async function createPatron(email = "patron@example.com") {
  return prisma.user.create({ data: { name: "Test Patron", email, passwordHash: "x", role: "PATRON" } });
}
