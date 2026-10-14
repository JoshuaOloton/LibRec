import { beforeEach, describe, expect, it } from "vitest";
import { reasonText } from "@/lib/reason";
import { prisma } from "@/server/db";
import { recordBorrow, recordRating } from "@/server/services/interactions";
import { getShelf, getMoreLikeThis } from "@/server/services/recommendations";
import { getSnapshot } from "@/server/services/recommender-cache";
import { createPatron, resetDb, seedFixtureBooks } from "./helpers";

type Book = Awaited<ReturnType<typeof seedFixtureBooks>>[number];
let books: Book[];
let patron: number;

beforeEach(async () => {
  await resetDb();
  books = await seedFixtureBooks();
  patron = (await createPatron("p@example.com")).id;
});

const logs = (userId: number) => prisma.recommendationLog.findMany({ where: { userId }, orderBy: [{ servedAt: "asc" }, { rank: "asc" }] });

/** A neighbour who rates books 0-2 like the patron below and also rated the Kitchen Chemistry book. */
async function seedNeighbour(kitchenRating: number | null = 5) {
  const q = (await createPatron("q@example.com")).id;
  await recordRating(q, books[0].id, 5);
  await recordRating(q, books[1].id, 4);
  await recordRating(q, books[2].id, 2);
  if (kitchenRating) await recordRating(q, books[5].id, kitchenRating);
  return q;
}

async function ratePatron() {
  await recordRating(patron, books[0].id, 5);
  await recordRating(patron, books[1].id, 4);
  await recordRating(patron, books[2].id, 2);
}

describe("TC11 logging (FR9)", () => {
  it("writes one log row per served item, with source, score, rank and reason, before returning", async () => {
    await recordRating(patron, books[0].id, 5);
    await recordBorrow(patron, books[2].id);

    const shelf = await getShelf(patron);
    if (shelf.kind !== "ready") throw new Error("expected a shelf");

    // The rows exist as soon as the call has returned.
    const rows = await logs(patron);
    expect(shelf.items.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(shelf.items.length);
    shelf.items.forEach((item, i) => {
      expect(rows[i]).toMatchObject({
        userId: patron,
        bookId: item.book.id,
        sourceComponent: item.source,
        rank: i + 1,
        reason: reasonText(item.reason),
      });
      expect(rows[i].score).toBeCloseTo(item.score, 12);
      expect(rows[i].servedAt).toBeInstanceOf(Date);
    });
  });

  it("serves a patron below the threshold from content only, with reasons naming their own books", async () => {
    await recordRating(patron, books[0].id, 5); // The Dragon Keeper (rated)
    await recordBorrow(patron, books[3].id); // Lagos Nights (borrowed)
    const shelf = await getShelf(patron);
    if (shelf.kind !== "ready") throw new Error("expected a shelf");

    expect(shelf.path).toBe("content-only");
    expect(shelf.basedOn).toBe(2);
    expect(shelf.items.every((i) => i.source === "CONTENT")).toBe(true);
    const owned = new Set([books[0].id, books[3].id]);
    expect(shelf.items.some((i) => owned.has(i.book.id))).toBe(false);

    const texts = shelf.items.map((i) => reasonText(i.reason));
    // Wizard of the Coast is a fantasy neighbour of The Dragon Keeper, so that is the book it is credited to.
    const wizard = shelf.items.find((i) => i.book.id === books[1].id)!;
    expect(reasonText(wizard.reason)).toBe("Because you rated The Dragon Keeper");
    expect(texts.every((t) => t.startsWith("Because you rated ") || t.endsWith(" you borrowed"))).toBe(true);
    expect(texts.some((t) => t === "Similar to Lagos Nights you borrowed" || t.startsWith("Because you rated"))).toBe(true);
  });

  it("attributes a collaborative pick to COLLABORATIVE with the neighbours' rating in the reason", async () => {
    await seedNeighbour(5);
    await ratePatron();
    const shelf = await getShelf(patron);
    if (shelf.kind !== "ready") throw new Error("expected a shelf");

    expect(shelf.path).toBe("weighted");
    const kitchen = shelf.items.find((i) => i.book.id === books[5].id)!;
    expect(kitchen.source).toBe("COLLABORATIVE");
    expect(kitchen.reason).toEqual({ kind: "similar-readers", stars: 5 });

    const row = (await logs(patron)).find((r) => r.bookId === books[5].id)!;
    expect(row.sourceComponent).toBe("COLLABORATIVE");
    expect(row.reason).toBe("Readers with similar taste rated this 5★");
    // The strongest content match is attributed to content.
    expect(shelf.items.some((i) => i.source === "CONTENT")).toBe(true);
  });

  describe("second line: readers also rated this (CF prediction >= 4.0)", () => {
    /** A neighbour who rated Starship Mathematics (content-close to the patron's books) as `starship`. */
    async function neighbourWithStarship(starship: number) {
      const q = await seedNeighbour(5);
      await recordRating(q, books[4].id, starship);
    }

    it("adds the prediction (one decimal) to a content-attributed item, and logs both lines", async () => {
      await neighbourWithStarship(5);
      await ratePatron();
      const shelf = await getShelf(patron);
      if (shelf.kind !== "ready") throw new Error("expected a shelf");

      // Hand-computed: patron mean (5+4+2)/3 = 3.667; neighbour mean (5+4+2+5+5)/5 = 4.2, so pred = 3.667 + (5 - 4.2) = 4.467.
      const starship = shelf.items.find((i) => i.book.id === books[4].id)!;
      expect(starship.source).toBe("CONTENT");
      expect(starship.alsoRated).toBeCloseTo(4.4667, 3);

      const row = (await logs(patron)).find((r) => r.bookId === books[4].id)!;
      expect(row.sourceComponent).toBe("CONTENT");
      expect(row.reason).toBe(`${reasonText(starship.reason)}\nReaders with similar taste also rated this 4.5★`);
    });

    it("adds nothing below 4.0, and nothing to a collaborative-attributed item", async () => {
      await neighbourWithStarship(1); // neighbour mean 3.4; pred = 3.667 + (1 - 3.4) = 1.27
      await ratePatron();
      const shelf = await getShelf(patron);
      if (shelf.kind !== "ready") throw new Error("expected a shelf");

      expect(shelf.items.find((i) => i.book.id === books[4].id)!.alsoRated).toBeUndefined();
      const kitchen = shelf.items.find((i) => i.book.id === books[5].id)!; // predicted high, but attributed to CF
      expect(kitchen.source).toBe("COLLABORATIVE");
      expect(kitchen.alsoRated).toBeUndefined();
      expect((await logs(patron)).some((r) => r.reason?.includes("\n"))).toBe(false);
    });

    it("leaves ranking, scores and sources unchanged and never appears on the content-only path", async () => {
      await neighbourWithStarship(5);
      await ratePatron();
      const withLine = await getShelf(patron);
      const { engine } = await getSnapshot();
      const history = [
        { bookId: books[0].id, ratingValue: 5 },
        { bookId: books[1].id, ratingValue: 4 },
        { bookId: books[2].id, ratingValue: 2 },
      ];
      const recs = engine.recommend(history, 10, { userId: patron });
      if (withLine.kind !== "ready") throw new Error("expected a shelf");
      expect(withLine.items.map((i) => [i.book.id, i.score, i.source])).toEqual(recs.map((r) => [r.bookId, r.score, r.source]));

      const cold = (await createPatron("cold@example.com")).id;
      await recordRating(cold, books[0].id, 5);
      const coldShelf = await getShelf(cold);
      if (coldShelf.kind !== "ready") throw new Error("expected a shelf");
      expect(coldShelf.path).toBe("content-only");
      expect(coldShelf.items.every((i) => i.alsoRated === undefined)).toBe(true);
    });

    it("formats the line from the prediction, capped at 5.0", () => {
      expect(reasonText({ kind: "rated", book: "X" }, 4.0)).toBe("Because you rated X\nReaders with similar taste also rated this 4.0★");
      expect(reasonText({ kind: "rated", book: "X" }, 4.26)).toBe("Because you rated X\nReaders with similar taste also rated this 4.3★");
      expect(reasonText({ kind: "rated", book: "X" }, 5.8)).toBe("Because you rated X\nReaders with similar taste also rated this 5.0★");
      expect(reasonText({ kind: "rated", book: "X" })).toBe("Because you rated X");
    });
  });

  it("logs each refresh as its own batch of rows", async () => {
    await recordRating(patron, books[0].id, 5);
    const first = await getShelf(patron);
    await getShelf(patron);
    if (first.kind !== "ready") throw new Error("expected a shelf");
    expect(await logs(patron)).toHaveLength(first.items.length * 2);
  });
});

describe("live cache", () => {
  it("is built once and kept current by ratings, with no refit", async () => {
    await seedNeighbour(null); // the neighbour has not rated Kitchen Chemistry yet
    await ratePatron();

    const before = await getShelf(patron);
    if (before.kind !== "ready") throw new Error("expected a shelf");
    expect(before.items.some((i) => i.source === "COLLABORATIVE")).toBe(false);
    const snapshot = await getSnapshot();

    // The neighbour rates it now; the cached index changes in place.
    const q = (await prisma.user.findUniqueOrThrow({ where: { email: "q@example.com" } })).id;
    await recordRating(q, books[5].id, 5);

    expect(await getSnapshot()).toBe(snapshot); // same fitted objects: nothing was rebuilt
    const after = await getShelf(patron);
    if (after.kind !== "ready") throw new Error("expected a shelf");
    const kitchen = after.items.find((i) => i.book.id === books[5].id)!;
    expect(kitchen.source).toBe("COLLABORATIVE");
    expect(kitchen.reason).toEqual({ kind: "similar-readers", stars: 5 });
  });

  it("uses a patron's new borrow on the very next request", async () => {
    await recordRating(patron, books[3].id, 5); // Lagos Nights
    const first = await getShelf(patron);
    await recordBorrow(patron, books[4].id); // Starship Mathematics
    const second = await getShelf(patron);
    if (first.kind !== "ready" || second.kind !== "ready") throw new Error("expected shelves");
    expect(first.items.some((i) => i.book.id === books[4].id)).toBe(true);
    expect(second.items.some((i) => i.book.id === books[4].id)).toBe(false); // now one of their own books
    expect(second.basedOn).toBe(2);
  });
});

describe("genre onboarding path", () => {
  it("serves books from the picked genres with 'Matches your interest in' and logs them as CONTENT", async () => {
    const shelf = await getShelf(patron, ["fantasy"]);
    if (shelf.kind !== "ready") throw new Error("expected a shelf");
    expect(shelf.path).toBe("genres");
    expect(shelf.items.map((i) => i.book.id).sort()).toEqual([books[0].id, books[1].id].sort());
    expect(shelf.items.every((i) => reasonText(i.reason) === "Matches your interest in fantasy")).toBe(true);

    const rows = await logs(patron);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sourceComponent === "CONTENT" && r.reason === "Matches your interest in fantasy")).toBe(true);
  });

  it("weights every picked genre equally and ignores unknown genres", async () => {
    const shelf = await getShelf(patron, ["fantasy", "non-fiction", "not-a-genre"]);
    if (shelf.kind !== "ready") throw new Error("expected a shelf");
    expect(shelf.genres).toEqual(["fantasy", "non-fiction"]);
    const ids = shelf.items.map((i) => i.book.id);
    expect(ids).toEqual(expect.arrayContaining([books[0].id, books[5].id])); // one from each picked genre family
    expect(ids).not.toContain(books[3].id); // contemporary fiction was not picked
  });

  it("asks for onboarding when there is no history and no valid genre", async () => {
    expect((await getShelf(patron)).kind).toBe("onboarding");
    expect((await getShelf(patron, ["not-a-genre"])).kind).toBe("onboarding");
    expect(await logs(patron)).toHaveLength(0);
  });

  it("ignores the picked genres once the patron has a history", async () => {
    await recordRating(patron, books[2].id, 5);
    const shelf = await getShelf(patron, ["fantasy"]);
    if (shelf.kind !== "ready") throw new Error("expected a shelf");
    expect(shelf.path).toBe("content-only");
  });
});

describe("More like this", () => {
  it("lists the closest books by content, each with a 'Similar to' slip, and logs it for a signed-in patron", async () => {
    const items = await getMoreLikeThis(books[0].id, patron);
    expect(items[0].book.id).toBe(books[1].id); // the other fantasy title
    expect(items.map((i) => i.book.id)).not.toContain(books[0].id);
    expect(items.every((i) => reasonText(i.reason) === "Similar to The Dragon Keeper")).toBe(true);

    const rows = await logs(patron);
    expect(rows).toHaveLength(items.length);
    expect(rows.every((r) => r.sourceComponent === "CONTENT")).toBe(true);
    expect(rows.map((r) => r.rank)).toEqual(items.map((_, i) => i + 1));
  });

  it("does not log for a logged-out visitor, and hides books the patron already has", async () => {
    expect((await getMoreLikeThis(books[0].id, null)).length).toBeGreaterThan(0);
    expect(await prisma.recommendationLog.count()).toBe(0);

    await recordBorrow(patron, books[1].id);
    const items = await getMoreLikeThis(books[0].id, patron);
    expect(items.map((i) => i.book.id)).not.toContain(books[1].id);
  });

  it("returns nothing for an unknown book", async () => {
    expect(await getMoreLikeThis(999_999, patron)).toEqual([]);
  });
});
