import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { BookCard } from "@/components/book-card";
import { buttonClasses } from "@/components/ui/button";
import { genreLabel } from "@/lib/utils";
import { getGenres, getLandingBooks } from "@/server/services/catalogue";

export const metadata: Metadata = {
  title: { absolute: "LibRec: book recommendations with a reason for every pick" },
};

const SUBJECTS_SHOWN = 14;

const steps = [
  {
    title: "Tell us what you like",
    body: "Pick a few subjects, or rate books you have already read. Three actions are enough to start.",
  },
  {
    title: "Get a shelf of picks",
    body: "LibRec compares the books' descriptions with your taste, and your ratings with those of readers like you.",
  },
  {
    title: "See why each book is there",
    body: "Every pick comes with a short note, so you can tell whether it is worth borrowing.",
  },
];

export default async function Home() {
  const [session, genres, { total, popular }] = await Promise.all([auth(), getGenres(), getLandingBooks()]);
  const signedIn = !!session?.user;
  const [example, basis] = popular;

  return (
    <div className="space-y-14 sm:space-y-20">
      <section className="grid items-center gap-8 py-2 lg:grid-cols-[1fr_26rem] lg:gap-16 lg:py-8">
        <div className="max-w-prose">
          <h1 className="text-3xl leading-tight sm:text-4xl">Find your next book, and see why it was picked</h1>
          <p className="mt-4 text-lg text-ink-muted">
            LibRec learns from the books you read and rate. It combines what a book is about with what similar readers
            enjoyed, and every suggestion tells you the reason.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/catalogue" className={buttonClasses("primary")}>
              Browse the catalogue
            </Link>
            <Link href="/recommendations" className={buttonClasses("secondary")}>
              Get recommendations
            </Link>
          </div>
          {!signedIn && (
            <p className="mt-4 text-ink-muted">
              New here?{" "}
              <Link href="/register" className="font-bold text-shelf hover:underline">
                Create an account
              </Link>{" "}
              or{" "}
              <Link href="/login" className="font-bold text-shelf hover:underline">
                log in
              </Link>
              .
            </p>
          )}
        </div>

        <aside aria-labelledby="subjects" className="rounded-lg border border-rule bg-surface p-5 sm:p-6">
          <h2 id="subjects" className="text-xl">
            Subjects in the catalogue
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {genres.slice(0, SUBJECTS_SHOWN).map((g) => (
              <li key={g.genre}>
                <Link
                  href={`/catalogue?genre=${encodeURIComponent(g.genre)}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-rule px-4 text-sm whitespace-nowrap hover:bg-paper"
                >
                  {genreLabel(g.genre)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-baseline justify-between gap-4 border-t border-rule pt-4">
            <span className="text-ink-muted">Books in catalogue</span>
            <span className="font-bold">{total.toLocaleString("en")}</span>
          </p>
        </aside>
      </section>

      <section aria-labelledby="how-it-works" className="grid gap-8 lg:grid-cols-[1fr_auto] lg:gap-16">
        <div>
          <h2 id="how-it-works" className="text-2xl">
            How it works
          </h2>
          <ol className="mt-6 max-w-prose space-y-6">
            {steps.map((step, i) => (
              <li key={step.title} className="border-l-[3px] border-shelf pl-4">
                <h3 className="text-lg font-bold">
                  <span aria-hidden className="mr-2 font-serif text-shelf">
                    {i + 1}.
                  </span>
                  {step.title}
                </h3>
                <p className="mt-1 text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>

        {example && basis && (
          <figure className="w-44 sm:w-52 lg:w-56">
            <BookCard book={example} reason={{ kind: "rated", book: basis.title }} priority />
            <figcaption className="mt-3 text-sm text-ink-muted">
              An example of a pick. The note under the cover is the reason.
            </figcaption>
          </figure>
        )}
      </section>

      {popular.length > 0 && (
        <section aria-labelledby="popular">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="popular" className="text-2xl">
              Popular with readers
            </h2>
            <Link href="/catalogue" className="inline-flex min-h-11 items-center font-bold text-shelf hover:underline">
              Browse all {total.toLocaleString("en")} books
            </Link>
          </div>
          <ul
            aria-label="Popular books"
            className="-mx-4 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-x-5 lg:overflow-visible lg:px-0"
          >
            {popular.map((book) => (
              <li key={book.id} className="w-36 shrink-0 snap-start sm:w-40 lg:w-auto">
                <BookCard book={book} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
