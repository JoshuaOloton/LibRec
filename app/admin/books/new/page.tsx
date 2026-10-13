import type { Metadata } from "next";
import { BookForm } from "@/components/book-form";
import { createBookAction } from "@/server/actions/admin-books";
import { getGenres } from "@/server/services/catalogue";

export const metadata: Metadata = { title: "Add book" };

export default async function NewBookPage() {
  const genres = await getGenres();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Add book</h1>
      <BookForm action={createBookAction} genreOptions={genres.map((g) => g.genre)} submitLabel="Add book" />
    </div>
  );
}
