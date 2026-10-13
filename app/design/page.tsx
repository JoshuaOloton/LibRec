import type { Metadata } from "next";
import { BookCard, BookCardSkeleton } from "@/components/book-card";
import { BookCover } from "@/components/book-cover";
import { RatingDemo } from "@/components/design-demo";
import { EmptyState } from "@/components/empty-state";
import { ReasonSlip } from "@/components/reason-slip";
import { StarRating } from "@/components/star-rating";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Design check" };
export const dynamic = "force-dynamic";

const swatches = [
  ["paper", "bg-paper"],
  ["surface", "bg-surface"],
  ["ink", "bg-ink"],
  ["ink-muted", "bg-ink-muted"],
  ["rule", "bg-rule"],
  ["shelf", "bg-shelf"],
  ["shelf-deep", "bg-shelf-deep"],
  ["brass", "bg-brass"],
  ["danger", "bg-danger"],
] as const;

/** Review page for components that have no screen yet (reason slips, top pick, states). Remove before release. */
export default async function DesignPage() {
  const [withCover, withoutCover] = await Promise.all([
    prisma.book.findMany({
      where: { coverUrl: { not: null } },
      orderBy: { id: "asc" },
      take: 4,
      select: { id: true, title: true, author: true, genres: true, coverUrl: true },
    }),
    prisma.book.findMany({
      where: { coverUrl: null },
      orderBy: { id: "asc" },
      take: 6,
      select: { id: true, title: true, author: true, genres: true, coverUrl: true },
    }),
  ]);
  const [top, ...rest] = withCover;

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-3xl">Design check</h1>
        <p className="mt-1 max-w-prose text-ink-muted">
          Every component from docs/STYLE.md in one place. This page is for review and is not linked from the app.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-2xl">Colour and type</h2>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {swatches.map(([name, cls]) => (
            <li key={name}>
              <div className={`${cls} h-12 rounded-md border border-rule`} />
              <p className="mt-1 text-sm">{name}</p>
            </li>
          ))}
        </ul>
        <div className="max-w-prose space-y-1">
          <p className="font-serif text-3xl font-semibold">Things Fall Apart (Literata 600)</p>
          <p className="font-serif text-xl font-medium">The Famished Road (Literata 500)</p>
          <p>Body text in Atkinson Hyperlegible, 1rem on a 1.6 line height.</p>
          <p className="text-sm text-ink-muted">Secondary text in ink-muted, 0.875rem.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Buttons and fields</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Borrow</Button>
          <Button variant="secondary">Rate this book</Button>
          <Button variant="danger">Delete book</Button>
          <Button disabled>Borrowed</Button>
          <a href="#" className={buttonClasses("primary")}>
            Link styled as a button
          </a>
        </div>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field label="Email" name="demo-email" placeholder="name@example.com" />
          <Field label="Password" name="demo-pw" type="password" error="Use at least 8 characters." />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Stars</h2>
        <RatingDemo />
        <div className="flex items-center gap-2">
          <StarRating readOnly value={4} />
          <span className="text-sm text-ink-muted">Read-only, 4 out of 5</span>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl">Your shelf (preview with the four reason types)</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          {top && (
            <div className="col-span-2 lg:col-span-1">
              <div className="max-w-xs">
                <BookCard book={top} topPick reason={{ kind: "rated", book: "Things Fall Apart" }} priority />
              </div>
            </div>
          )}
          {rest[0] && <BookCard book={rest[0]} reason={{ kind: "borrowed", book: "Half of a Yellow Sun" }} />}
          {rest[1] && <BookCard book={rest[1]} reason={{ kind: "similar-readers", stars: 5 }} />}
          {rest[2] && <BookCard book={rest[2]} reason={{ kind: "interest", genre: "fantasy" }} />}
        </div>
        <ReasonSlip reason={{ kind: "rated", book: "A very long book title that has to wrap onto a second line on a 360px screen" }} className="max-w-xs" />
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Generated fallback covers</h2>
        <ul className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {withoutCover.map((b) => (
            <li key={b.id}>
              <BookCover title={b.title} author={b.author} genre={b.genres[0]} coverUrl={b.coverUrl} />
              <p className="mt-1 text-sm text-ink-muted">{b.genres[0]}</p>
            </li>
          ))}
          <li>
            <BookCover title="A long title that has to be clamped to a few lines on a small cover" author="An Author With A Long Name" genre="classics" />
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Empty and loading states</h2>
        <EmptyState
          title="No books match “quantum”"
          action={<a href="#" className={buttonClasses("secondary")}>Show all books</a>}
        >
          Try an author’s name or a broader subject.
        </EmptyState>
        <ul className="grid max-w-xl grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <BookCardSkeleton />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
