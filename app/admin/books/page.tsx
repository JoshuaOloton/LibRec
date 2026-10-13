import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { genreLabel } from "@/lib/utils";
import { listBooksForAdmin } from "@/server/services/books";

export const metadata: Metadata = { title: "Manage books" };

type SearchParams = Promise<{ q?: string; page?: string; saved?: string; deleted?: string }>;

function href(q: string | undefined, page: number) {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/admin/books?${qs}` : "/admin/books";
}

export default async function AdminBooksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const { books, total, pageCount } = await listBooksForAdmin({ q, page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Books</h1>
          <p className="text-ink-muted">{total} in the catalogue.</p>
        </div>
        <Link href="/admin/books/new" className={buttonClasses("primary")}>
          Add book
        </Link>
      </div>

      {(sp.saved || sp.deleted) && (
        <p role="status" className="border-l-[3px] border-shelf bg-surface px-3 py-2">
          {sp.deleted ? "Book deleted." : "Changes saved."}
        </p>
      )}

      <form role="search" className="flex max-w-lg gap-2">
        <label htmlFor="admin-q" className="sr-only">
          Search books by title or author
        </label>
        <input
          id="admin-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by title or author"
          className="min-h-11 w-full min-w-0 rounded-md border border-rule bg-surface px-3"
        />
        <button type="submit" className={buttonClasses("secondary")}>
          Search
        </button>
      </form>

      {books.length === 0 ? (
        <EmptyState title={q ? `No books match “${q}”` : "No books yet"}>
          {q ? "Try part of the title or the author’s surname." : "Add the first book to start the catalogue."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border border-rule bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-rule text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Title</th>
                <th scope="col" className="px-3 py-2 font-bold">Author</th>
                <th scope="col" className="px-3 py-2 font-bold">Genres</th>
                <th scope="col" className="px-3 py-2 font-bold">Year</th>
                <th scope="col" className="px-3 py-2 text-right font-bold">Interactions</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.id} className="border-b border-rule last:border-0">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/book/${b.id}`} className="hover:underline">
                      {b.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{b.author}</td>
                  <td className="px-3 py-2 text-ink-muted">{b.genres.map(genreLabel).join(", ")}</td>
                  <td className="px-3 py-2">{b.publicationYear ?? "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b._count.interactions}</td>
                  <td className="px-3 py-1 text-right">
                    <Link
                      href={`/admin/books/${b.id}/edit`}
                      className="inline-flex min-h-11 items-center px-2 font-bold text-shelf hover:underline"
                      aria-label={`Edit ${b.title}`}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={href(q, page - 1)} className={buttonClasses("secondary")}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-ink-muted">
            Page {page} of {pageCount}
          </p>
          {page < pageCount ? (
            <Link href={href(q, page + 1)} className={buttonClasses("secondary")}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
