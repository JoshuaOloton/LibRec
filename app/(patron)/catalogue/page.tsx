import type { Metadata } from "next";
import Link from "next/link";
import { BookCard } from "@/components/book-card";
import { EmptyState } from "@/components/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { cn, genreLabel } from "@/lib/utils";
import { getGenres, searchBooks } from "@/server/services/catalogue";

export const metadata: Metadata = { title: "Catalogue" };

type SearchParams = Promise<{ q?: string | string[]; genre?: string | string[]; page?: string | string[] }>;

const VISIBLE_GENRES = 12;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(params: { q?: string; genre?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.genre) sp.set("genre", params.genre);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/catalogue?${qs}` : "/catalogue";
}

function summary(total: number, q?: string, genre?: string) {
  if (!q && !genre) return `${total} books. Search above or pick a subject.`;
  const inGenre = genre ? ` in ${genreLabel(genre).toLowerCase()}` : "";
  if (!q) return `${total} ${total === 1 ? "book" : "books"}${inGenre}.`;
  return `${total} ${total === 1 ? "book matches" : "books match"} “${q}”${inGenre}.`;
}

export default async function CataloguePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() || undefined;
  const genre = first(sp.genre) || undefined;
  const requested = Number.parseInt(first(sp.page) ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;

  const [genres, { books, total, pageCount }] = await Promise.all([getGenres(), searchBooks({ q, genre, page })]);
  // Most common subjects stay visible; the rest sit behind a disclosure. The active one is always visible.
  const shownGenres = genres.filter((g, i) => i < VISIBLE_GENRES || g.genre === genre);
  const moreGenres = genres.filter((g) => !shownGenres.includes(g));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl">Catalogue</h1>
        <p className="mt-1 text-ink-muted" aria-live="polite">
          {summary(total, q, genre)}
        </p>
      </div>

      <nav aria-label="Filter by genre" className="space-y-3">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <li className="shrink-0">
            <Chip href={href({ q })} active={!genre}>
              All
            </Chip>
          </li>
          {shownGenres.map((g) => (
            <li key={g.genre} className="shrink-0">
              <Chip href={href({ q, genre: g.genre })} active={genre === g.genre}>
                {genreLabel(g.genre)}
              </Chip>
            </li>
          ))}
        </ul>
        {moreGenres.length > 0 && (
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-shelf hover:underline">
              More subjects ({moreGenres.length})
            </summary>
            <ul className="mt-2 flex flex-wrap gap-2">
              {moreGenres.map((g) => (
                <li key={g.genre}>
                  <Chip href={href({ q, genre: g.genre })} active={genre === g.genre}>
                    {genreLabel(g.genre)}
                  </Chip>
                </li>
              ))}
            </ul>
          </details>
        )}
      </nav>

      {books.length === 0 ? (
        <EmptyState
          title={q ? `No books match “${q}”` : "No books in this subject yet"}
          action={
            <Link href="/catalogue" className={buttonClasses("secondary")}>
              Show all books
            </Link>
          }
        >
          {q ? "Try an author’s name or a broader subject." : "Pick another subject, or go back to all books."}
        </EmptyState>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {books.map((book, i) => (
              <li key={book.id}>
                <BookCard book={book} priority={i < 4} />
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-4 border-t border-rule pt-4">
              {page > 1 ? (
                <Link href={href({ q, genre, page: page - 1 })} className={buttonClasses("secondary")} rel="prev">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <p className="text-sm text-ink-muted">
                Page {page} of {pageCount}
              </p>
              {page < pageCount ? (
                <Link href={href({ q, genre, page: page + 1 })} className={buttonClasses("secondary")} rel="next">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm whitespace-nowrap",
        active ? "border-shelf bg-shelf font-bold text-surface" : "border-rule hover:bg-surface",
      )}
    >
      {children}
    </Link>
  );
}
