"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bookInputSchema, parseGenres, type BookInput } from "@/lib/book-schema";
import { createBook, deleteBook, updateBook } from "@/server/services/books";
import { requireAdmin } from "@/server/services/auth";

export type BookFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof BookInput, string>>;
  /** Raw values, so the form keeps what the admin typed after an error. */
  values?: Record<string, string | string[]>;
};

function readForm(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? "");
  const genres = [...new Set([...formData.getAll("genres").map(String), ...parseGenres(text("newGenres"))])];
  return {
    values: {
      title: text("title"),
      author: text("author"),
      genres,
      newGenres: text("newGenres"),
      description: text("description"),
      publicationYear: text("publicationYear"),
      isbn: text("isbn"),
      coverUrl: text("coverUrl"),
    },
  };
}

function validate(formData: FormData): { data: BookInput } | { state: BookFormState } {
  const { values } = readForm(formData);
  const parsed = bookInputSchema.safeParse(values);
  if (parsed.success) return { data: parsed.data };

  const fieldErrors: NonNullable<BookFormState["fieldErrors"]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof BookInput;
    fieldErrors[key] ??= issue.message;
  }
  return { state: { fieldErrors, values } };
}

function refreshCatalogue(id?: number) {
  revalidatePath("/catalogue");
  revalidatePath("/admin/books");
  if (id) revalidatePath(`/book/${id}`);
}

export async function createBookAction(_prev: BookFormState, formData: FormData): Promise<BookFormState> {
  await requireAdmin(); // the proxy is only an optimistic check
  const result = validate(formData);
  if ("state" in result) return result.state;

  const { id } = await createBook(result.data);
  refreshCatalogue(id);
  redirect(`/admin/books?saved=${id}`);
}

export async function updateBookAction(id: number, _prev: BookFormState, formData: FormData): Promise<BookFormState> {
  await requireAdmin();
  const result = validate(formData);
  if ("state" in result) return result.state;

  try {
    await updateBook(id, result.data);
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") return { error: "This book no longer exists. It may have been deleted." };
    throw err;
  }
  refreshCatalogue(id);
  redirect(`/admin/books?saved=${id}`);
}

export async function deleteBookAction(id: number) {
  await requireAdmin();
  try {
    await deleteBook(id);
  } catch (err) {
    if ((err as { code?: string }).code !== "P2025") throw err; // already gone: same outcome
  }
  refreshCatalogue(id);
  redirect("/admin/books?deleted=1");
}
