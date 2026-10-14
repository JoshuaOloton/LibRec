import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getStatistics } from "@/server/services/statistics";
import { createPatron, resetDb, seedFixtureBooks } from "./helpers";

type Book = Awaited<ReturnType<typeof seedFixtureBooks>>[number];
let books: Book[];
let a: number;
let b: number;
let c: number;

const at = (iso: string) => new Date(iso);

async function interact(userId: number, bookId: number, type: "BORROW" | "RATE", ratingValue: number | null, when: string, simulated = false) {
  await prisma.interaction.create({ data: { userId, bookId, type, ratingValue, timestamp: at(when), simulated } });
}

beforeEach(async () => {
  await resetDb();
  books = await seedFixtureBooks();
  a = (await createPatron("a@example.com")).id;
  b = (await createPatron("b@example.com")).id;
  // A patron from the Cycle 0 dataset: their timestamps are synthetic.
  c = (await prisma.user.create({ data: { name: "Patron 9", email: "user9@librec.test", passwordHash: "x" } })).id;
});

describe("TC13 statistics (FR11)", () => {
  it("is an empty but valid report when nothing has been recorded", async () => {
    const s = await getStatistics();
    expect(s.totals).toMatchObject({ books: 6, patrons: 3, borrows: 0, ratings: 0, logged: 0 });
    expect(s.mostBorrowed).toEqual([]);
    expect(s.mostRated).toEqual([]);
    expect(s.interactionsOverTime).toEqual([]);
    expect(s.sourceMix).toEqual([]);
    expect(s.unreadHoldings.count).toBe(6);
  });

  it("ranks the most borrowed and most rated books from the recorded interactions", async () => {
    // Borrows: book0 x3, book1 x2, book2 x1.  Ratings: book1 x3 (5, 4, 3), book0 x1 (2).
    for (const u of [a, b, c]) await interact(u, books[0].id, "BORROW", null, "2025-01-10T00:00:00Z");
    for (const u of [a, b]) await interact(u, books[1].id, "BORROW", null, "2025-01-11T00:00:00Z");
    await interact(a, books[2].id, "BORROW", null, "2025-01-12T00:00:00Z");
    await interact(a, books[1].id, "RATE", 5, "2025-01-13T00:00:00Z");
    await interact(b, books[1].id, "RATE", 4, "2025-01-13T00:00:00Z");
    await interact(c, books[1].id, "RATE", 3, "2025-01-13T00:00:00Z");
    await interact(a, books[0].id, "RATE", 2, "2025-01-14T00:00:00Z");

    const s = await getStatistics();
    expect(s.totals).toMatchObject({ borrows: 6, ratings: 4 });
    expect(s.mostBorrowed.map((r) => [r.title, r.count])).toEqual([
      ["The Dragon Keeper", 3],
      ["Wizard of the Coast", 2],
      ["Orbital Decay", 1],
    ]);
    expect(s.mostRated.map((r) => [r.title, r.count])).toEqual([
      ["Wizard of the Coast", 3],
      ["The Dragon Keeper", 1],
    ]);
    expect(s.mostRated[0].meanRating).toBeCloseTo(4, 12); // (5 + 4 + 3) / 3
    expect(s.mostRated[1].meanRating).toBeCloseTo(2, 12);
  });

  it("buckets interactions by month and separates synthetic timestamps from recorded ones", async () => {
    await interact(c, books[0].id, "RATE", 5, "2025-01-05T12:00:00Z"); // dataset patron: synthetic
    await interact(c, books[1].id, "BORROW", null, "2025-01-20T12:00:00Z", true); // simulated flag: synthetic
    await interact(a, books[2].id, "BORROW", null, "2025-01-25T12:00:00Z"); // a real patron: recorded
    await interact(a, books[3].id, "RATE", 4, "2025-03-02T12:00:00Z"); // recorded, two months later

    const s = await getStatistics();
    expect(s.interactionsOverTime).toEqual([
      { month: "2025-01", synthetic: 2, recorded: 1 },
      { month: "2025-03", synthetic: 0, recorded: 1 },
    ]);
  });

  it("lists books nobody has borrowed or rated as unread holdings", async () => {
    await interact(a, books[0].id, "BORROW", null, "2025-01-10T00:00:00Z");
    await interact(b, books[1].id, "RATE", 4, "2025-01-10T00:00:00Z");

    const { unreadHoldings } = (await getStatistics());
    expect(unreadHoldings.count).toBe(4);
    expect(unreadHoldings.share).toBeCloseTo(4 / 6, 12);
    expect(unreadHoldings.sample.map((x) => x.title)).toEqual(["Kitchen Chemistry", "Lagos Nights", "Orbital Decay", "Starship Mathematics"]);
  });

  it("reports the recommendation source mix from the log", async () => {
    const row = (sourceComponent: "CONTENT" | "COLLABORATIVE" | "HYBRID", rank: number) => ({
      userId: a,
      bookId: books[rank].id,
      sourceComponent,
      score: 0.5,
      rank: rank + 1,
    });
    await prisma.recommendationLog.createMany({
      data: [row("CONTENT", 0), row("CONTENT", 1), row("CONTENT", 2), row("COLLABORATIVE", 3)],
    });

    const { sourceMix, totals } = await getStatistics();
    expect(totals.logged).toBe(4);
    expect(sourceMix).toEqual([
      { source: "CONTENT", count: 3, share: 0.75 },
      { source: "COLLABORATIVE", count: 1, share: 0.25 },
    ]);
  });
});
