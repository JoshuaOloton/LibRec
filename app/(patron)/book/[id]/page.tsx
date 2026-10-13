import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { BookActions } from "@/components/book-actions";
import { BookCover } from "@/components/book-cover";
import { genreLabel } from "@/lib/utils";
import { getBook } from "@/server/services/books";
import { getInteractionState } from "@/server/services/interactions";

type Params = Promise<{ id: string }>;

function parseId(raw: string) {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = parseId((await params).id);
  const book = id ? await getBook(id) : null;
  return { title: book?.title ?? "Book not found" };
}

export default async function BookPage({ params }: { params: Params }) {
  const id = parseId((await params).id);
  const book = id ? await getBook(id) : null;
  if (!book) notFound();

  const session = await auth();
  const state = session?.user ? await getInteractionState(Number(session.user.id), book.id) : null;

  return (
    <article className="grid gap-6 md:grid-cols-[240px_1fr] md:gap-10 lg:grid-cols-[300px_1fr]">
      <div className="max-w-60 md:max-w-none">
        <BookCover
          title={book.title}
          author={book.author}
          genre={book.genres[0]}
          coverUrl={book.coverUrl}
          priority
          sizes="(min-width: 1024px) 300px, 240px"
        />
      </div>

      <div className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl">{book.title}</h1>
          <p className="mt-1 text-lg">{book.author}</p>
          {book.publicationYear !== null && (
            <p className="text-ink-muted">First published {formatYear(book.publicationYear)}</p>
          )}
          <ul className="mt-3 flex flex-wrap gap-2">
            {book.genres.map((g) => (
              <li key={g}>
                <Link
                  href={`/catalogue?genre=${encodeURIComponent(g)}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-rule px-4 text-sm hover:bg-surface"
                >
                  {genreLabel(g)}
                </Link>
              </li>
            ))}
          </ul>
        </header>

        {book.description ? (
          <p className="max-w-[70ch] whitespace-pre-line">{book.description}</p>
        ) : (
          <p className="max-w-[70ch] text-ink-muted">This book has no description yet.</p>
        )}

        <BookActions
          bookId={book.id}
          signedIn={!!session?.user}
          borrowed={state?.borrowed ?? false}
          rating={state?.rating ?? 0}
        />
      </div>
    </article>
  );
}

function formatYear(year: number) {
  return year < 0 ? `${-year} BC` : String(year);
}
