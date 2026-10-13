"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BookCover } from "@/components/book-cover";
import { StarRating } from "@/components/star-rating";
import { Button, buttonClasses } from "@/components/ui/button";
import { genreLabel } from "@/lib/utils";
import { rateAction } from "@/server/actions/interactions";
import { saveGenresAction } from "@/server/actions/onboarding";

type Genre = { slug: string; count: number };
type Book = { id: number; title: string; author: string; genres: string[]; coverUrl: string | null };

/**
 * First screen for a patron with no history (TC15). Two ways in, either one ends on Your shelf:
 * pick subjects (one form submit), or rate a few popular books (each rating is saved straight away).
 */
export function OnboardingForm({ genres, popular }: { genres: Genre[]; popular: Book[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [, startTransition] = useTransition();
  const rated = Object.keys(ratings).length;

  function toggle(slug: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });
  }

  function rate(book: Book, value: number) {
    const previous = ratings[book.id];
    setRatings((r) => ({ ...r, [book.id]: value })); // optimistic; rolled back on failure
    startTransition(async () => {
      const result = await rateAction(book.id, value);
      if (result.ok) {
        setMessage({ text: `Rated ${value}★. Your shelf will use it.` });
      } else {
        setRatings((r) => {
          const next = { ...r };
          if (previous) next[book.id] = previous;
          else delete next[book.id];
          return next;
        });
        setMessage({ text: result.error, error: true });
      }
    });
  }

  return (
    <div className="space-y-10">
      <form action={saveGenresAction} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="font-serif text-xl font-semibold">Pick 3 or more subjects you enjoy</legend>
          <p className="text-ink-muted">One is enough to start. You can change them later.</p>
          <ul className="flex flex-wrap gap-2">
            {genres.map((g) => (
              <li key={g.slug}>
                <label className="relative inline-flex">
                  <input
                    type="checkbox"
                    name="genre"
                    value={g.slug}
                    checked={picked.has(g.slug)}
                    onChange={() => toggle(g.slug)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-rule px-4 text-base peer-checked:border-shelf peer-checked:bg-shelf peer-checked:text-surface peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-shelf">
                    {genreLabel(g.slug)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <Button type="submit" disabled={picked.size === 0}>
          Show my shelf
        </Button>
      </form>

      {popular.length > 0 && (
        <section aria-labelledby="rate-heading" className="space-y-4 border-t border-rule pt-8">
          <div>
            <h2 id="rate-heading" className="text-xl">
              Or rate a few popular books
            </h2>
            <p className="text-ink-muted">Rate the ones you’ve read. A single rating is enough to start.</p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2">
            {popular.map((book) => (
              <li key={book.id} className="flex gap-3">
                <div className="w-16 shrink-0">
                  <BookCover title={book.title} author={book.author} genre={book.genres[0]} coverUrl={book.coverUrl} sizes="64px" />
                </div>
                <div className="min-w-0">
                  <p className="leading-snug font-medium">{book.title}</p>
                  <p className="text-sm text-ink-muted">{book.author}</p>
                  <StarRating
                    value={ratings[book.id] ?? 0}
                    onChange={(v) => rate(book, v)}
                    label={`Rate ${book.title}`}
                    className="-ml-2"
                  />
                </div>
              </li>
            ))}
          </ul>
          <p role="status" aria-live="polite" className={message?.error ? "min-h-6 text-danger" : "min-h-6 text-shelf"}>
            {message?.text}
          </p>
          {rated > 0 && (
            <Link href="/recommendations" className={buttonClasses("primary")}>
              Go to Your shelf
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
