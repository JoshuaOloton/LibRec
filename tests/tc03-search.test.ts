import { beforeAll, describe, expect, it } from "vitest";
import { getGenres, PAGE_SIZE, searchBooks } from "@/server/services/catalogue";
import { resetDb, seedFixtureBooks } from "./helpers";

beforeAll(async () => {
  await resetDb();
  await seedFixtureBooks();
});

const titles = (r: { books: { title: string }[] }) => r.books.map((b) => b.title).sort();

describe("TC03 catalogue search (FR2)", () => {
  it("finds books by title", async () => {
    expect(titles(await searchBooks({ q: "orbital" }))).toEqual(["Orbital Decay"]);
  });

  it("finds books by author", async () => {
    expect(titles(await searchBooks({ q: "Ada Okoro" }))).toEqual(["Starship Mathematics", "The Dragon Keeper"]);
  });

  it("finds books by genre, including a spaced label for a hyphenated genre", async () => {
    expect(titles(await searchBooks({ q: "science fiction" }))).toEqual(["Orbital Decay", "Starship Mathematics"]);
    expect(titles(await searchBooks({ q: "fantasy" }))).toEqual(["The Dragon Keeper", "Wizard of the Coast"]);
  });

  it("is case-insensitive and ignores surrounding spaces", async () => {
    expect(titles(await searchBooks({ q: "  LAGOS nights " }))).toEqual(["Lagos Nights"]);
  });

  it("filters by an exact genre, alone or with a query", async () => {
    expect(titles(await searchBooks({ genre: "non-fiction" }))).toEqual(["Kitchen Chemistry", "Starship Mathematics"]);
    expect(titles(await searchBooks({ genre: "non-fiction", q: "chemistry" }))).toEqual(["Kitchen Chemistry"]);
  });

  it("returns nothing, with a zero total, when nothing matches", async () => {
    const r = await searchBooks({ q: "quantum" });
    expect(r.books).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.pageCount).toBe(1);
  });

  it("browses everything A–Z when there is no query", async () => {
    const r = await searchBooks({});
    expect(r.total).toBe(6);
    expect(r.books.map((b) => b.title)).toEqual([...r.books.map((b) => b.title)].sort());
    expect(r.books.length).toBeLessThanOrEqual(PAGE_SIZE);
  });

  it("returns a page past the end as empty without failing", async () => {
    const r = await searchBooks({ page: 99 });
    expect(r.books).toEqual([]);
    expect(r.total).toBe(6);
  });

  it("lists genres with counts, most common first", async () => {
    const genres = await getGenres();
    expect(genres[0]).toMatchObject({ count: 2 });
    expect(genres.find((g) => g.genre === "contemporary-fiction")?.count).toBe(1);
  });
});
