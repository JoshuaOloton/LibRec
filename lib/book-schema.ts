import { z } from "zod";

/** Turn "Science fiction, young adult" into ["science-fiction", "young-adult"]. */
export function parseGenres(input: string) {
  return input
    .split(",")
    .map((g) =>
      g
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]/g, ""),
    )
    .filter(Boolean);
}

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

/** Validation for the admin add/edit form (FR10). Inputs are strings from FormData. */
export const bookInputSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(300, "Use 300 characters or fewer."),
  author: z.string().trim().min(1, "Enter an author.").max(200, "Use 200 characters or fewer."),
  genres: z
    .array(z.string().regex(/^[a-z0-9-]+$/, "Genres use lowercase letters, numbers and hyphens."))
    .min(1, "Choose at least one genre.")
    .max(6, "Choose six genres or fewer."),
  description: optionalText.pipe(z.string().max(5000, "Use 5,000 characters or fewer.").nullable()),
  publicationYear: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int("Enter a whole year.").min(-3000, "Enter a year after 3000 BC.").max(2100, "Enter a year up to 2100.").nullable()),
  isbn: optionalText.pipe(
    z
      .string()
      .regex(/^\d{9}[\dXx]$/, "An ISBN-10 has 10 characters: digits, with an optional X at the end.")
      .transform((v) => v.toUpperCase())
      .nullable(),
  ),
  coverUrl: optionalText.pipe(
    z
      .url({ protocol: /^https$/, error: "Enter a link starting with https://." })
      .max(500, "Use 500 characters or fewer.")
      .nullable(),
  ),
});

export type BookInput = z.output<typeof bookInputSchema>;
