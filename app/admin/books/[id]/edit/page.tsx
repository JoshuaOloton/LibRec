import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookForm } from "@/components/book-form";
import { DeleteBook } from "@/components/delete-book";
import { updateBookAction } from "@/server/actions/admin-books";
import { countBookInteractions, getBook } from "@/server/services/books";
import { getGenres } from "@/server/services/catalogue";

export const metadata: Metadata = { title: "Edit book" };

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = /^\d+$/.test(raw) ? Number(raw) : null;
  const book = id ? await getBook(id) : null;
  if (!id || !book) notFound();

  const [genres, interactions] = await Promise.all([getGenres(), countBookInteractions(id)]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl">Edit book</h1>
        <BookForm
          action={updateBookAction.bind(null, id)}
          genreOptions={genres.map((g) => g.genre)}
          submitLabel="Save changes"
          defaults={{
            title: book.title,
            author: book.author,
            genres: book.genres,
            description: book.description ?? "",
            publicationYear: book.publicationYear?.toString() ?? "",
            isbn: book.isbn ?? "",
            coverUrl: book.coverUrl ?? "",
          }}
        />
      </div>
      <section className="space-y-3 border-t border-rule pt-6">
        <h2 className="text-xl">Delete this book</h2>
        <DeleteBook id={id} title={book.title} interactions={interactions} />
      </section>
    </div>
  );
}
