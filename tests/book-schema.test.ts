import { describe, expect, it } from "vitest";
import { bookInputSchema, parseGenres } from "@/lib/book-schema";
import { buildContentText } from "@/lib/content-text";

describe("admin book form validation (FR10)", () => {
  const valid = {
    title: " Things Fall Apart ",
    author: "Chinua Achebe",
    genres: ["classics"],
    description: "",
    publicationYear: "1958",
    isbn: "",
    coverUrl: "",
  };

  it("trims text and turns blank optional fields into null", () => {
    const r = bookInputSchema.parse(valid);
    expect(r).toMatchObject({ title: "Things Fall Apart", description: null, publicationYear: 1958, isbn: null, coverUrl: null });
  });

  it("accepts ancient years and a trailing X in the ISBN", () => {
    expect(bookInputSchema.parse({ ...valid, publicationYear: "-750", isbn: "080442957x" })).toMatchObject({
      publicationYear: -750,
      isbn: "080442957X",
    });
  });

  it.each([
    ["title", { title: "  " }],
    ["author", { author: "" }],
    ["genres", { genres: [] }],
    ["genres", { genres: ["Not A Slug"] }],
    ["publicationYear", { publicationYear: "19x8" }],
    ["publicationYear", { publicationYear: "2300" }],
    ["isbn", { isbn: "123" }],
    ["coverUrl", { coverUrl: "http://insecure.example/cover.jpg" }],
    ["coverUrl", { coverUrl: "not a url" }],
  ])("rejects a bad %s", (field, override) => {
    const r = bookInputSchema.safeParse({ ...valid, ...override });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe(field);
  });

  it("turns typed genres into slugs", () => {
    expect(parseGenres("African literature, Poetry ,, science_fiction")).toEqual([
      "african-literature",
      "poetry",
      "science-fiction",
    ]);
  });
});

describe("content text for TF-IDF", () => {
  it("joins genres (hyphens as spaces), author and description", () => {
    expect(buildContentText({ genres: ["science-fiction", "classics"], author: " Ada Okoro ", description: "A story." })).toBe(
      "science fiction, classics. Ada Okoro. A story.",
    );
  });

  it("still works with no description", () => {
    expect(buildContentText({ genres: ["poetry"], author: "Ada Okoro", description: null })).toBe("poetry. Ada Okoro");
  });
});
