import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookInput } from "@/lib/book-schema";
import { buildContentText } from "@/lib/content-text";
import { prisma } from "@/server/db";
import { createBook, deleteBook, listBooksForAdmin, updateBook } from "@/server/services/books";
import { recordRating } from "@/server/services/interactions";
import { createPatron, resetDb, seedFixtureBooks } from "./helpers";

const mockSession = vi.hoisted(() => ({ current: null as { user: { id: string; role: string } } | null }));
vi.mock("@/auth", () => ({ auth: async () => mockSession.current }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const newBook: BookInput = {
  title: "Things Fall Apart",
  author: "Chinua Achebe",
  genres: ["classics", "african-literature"],
  description: "A wrestler faces the arrival of colonial rule in an Igbo village.",
  publicationYear: 1958,
  isbn: null,
  coverUrl: null,
};

const featureOf = (bookId: number) => prisma.bookFeature.findUnique({ where: { bookId } });

beforeEach(async () => {
  await resetDb();
  await seedFixtureBooks();
});

describe("TC12 catalogue admin (FR10)", () => {
  it("adds a book, builds its content text and gives it a BookFeature", async () => {
    const { id } = await createBook(newBook);

    const book = await prisma.book.findUniqueOrThrow({ where: { id } });
    expect(book).toMatchObject({ title: "Things Fall Apart", author: "Chinua Achebe", publicationYear: 1958 });
    expect(book.genres).toEqual(["classics", "african-literature"]);
    expect(book.contentText).toBe(buildContentText(newBook));
    expect(book.contentText).toContain("african literature"); // hyphens become spaces for TF-IDF

    expect(await featureOf(id)).not.toBeNull();
    // every book has a feature row, not just the new one
    expect(await prisma.bookFeature.count()).toBe(await prisma.book.count());
  });

  it("updates a book and regenerates its BookFeature", async () => {
    const [dragonKeeper] = await prisma.book.findMany({ where: { title: "The Dragon Keeper" } });
    const before = await featureOf(dragonKeeper.id);
    expect(before).not.toBeNull();

    await new Promise((r) => setTimeout(r, 20));
    // Re-describe it with vocabulary shared with other books, so the vector must change.
    await updateBook(dragonKeeper.id, {
      ...newBook,
      title: "The Dragon Keeper",
      author: "Ada Okoro",
      genres: ["science-fiction"],
      description: "A station crew navigates a failing orbit between planets.",
    });

    const book = await prisma.book.findUniqueOrThrow({ where: { id: dragonKeeper.id } });
    expect(book.contentText).toContain("station crew");
    expect(book.genres).toEqual(["science-fiction"]);

    const after = await featureOf(dragonKeeper.id);
    expect(after).not.toBeNull();
    expect(after!.generatedAt.getTime()).toBeGreaterThan(before!.generatedAt.getTime());
    expect(after!.tfidfVector).not.toEqual(before!.tfidfVector);
    expect(await prisma.bookFeature.count()).toBe(await prisma.book.count());
  });

  it("removes a book with its feature row and interactions, and leaves the others intact", async () => {
    const patron = await createPatron();
    const { id } = await createBook(newBook);
    await recordRating(patron.id, id, 5);
    const countBefore = await prisma.book.count();

    await deleteBook(id);

    expect(await prisma.book.findUnique({ where: { id } })).toBeNull();
    expect(await featureOf(id)).toBeNull();
    expect(await prisma.interaction.count({ where: { bookId: id } })).toBe(0);
    expect(await prisma.book.count()).toBe(countBefore - 1);
    expect(await prisma.bookFeature.count()).toBe(countBefore - 1);
  });

  it("lists books for admins with interaction counts and a search", async () => {
    const patron = await createPatron();
    const { id } = await createBook(newBook);
    await recordRating(patron.id, id, 4);

    const all = await listBooksForAdmin({});
    expect(all.total).toBe(7);
    expect(all.books.find((b) => b.id === id)?._count.interactions).toBe(1);

    const found = await listBooksForAdmin({ q: "achebe" });
    expect(found.books.map((b) => b.title)).toEqual(["Things Fall Apart"]);
  });
});

describe("admin guard", () => {
  it("lets an admin through and bounces everyone else (server-side check behind the proxy)", async () => {
    const { requireAdmin } = await import("@/server/services/auth");

    mockSession.current = null;
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");

    mockSession.current = { user: { id: "1", role: "PATRON" } };
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/catalogue");

    mockSession.current = { user: { id: "1", role: "ADMIN" } };
    await expect(requireAdmin()).resolves.toMatchObject({ role: "ADMIN" });
  });
});
