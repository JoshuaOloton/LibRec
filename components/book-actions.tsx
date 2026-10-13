"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { StarRating } from "@/components/star-rating";
import { Button, buttonClasses } from "@/components/ui/button";
import { borrowAction, rateAction } from "@/server/actions/interactions";

type Props = {
  bookId: number;
  signedIn: boolean;
  borrowed: boolean;
  rating: number;
};

/** Borrow and Rate (FR3). A short status message confirms each action, as STYLE.md asks. */
export function BookActions({ bookId, signedIn, borrowed: initialBorrowed, rating: initialRating }: Props) {
  const [borrowed, setBorrowed] = useState(initialBorrowed);
  const [rating, setRating] = useState(initialRating);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  if (!signedIn) {
    const callback = encodeURIComponent(`/book/${bookId}`);
    return (
      <div className="space-y-3">
        <p className="text-ink-muted">Log in to borrow or rate this book.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/login?callbackUrl=${callback}`} className={buttonClasses("primary")}>
            Log in
          </Link>
          <Link href={`/register?callbackUrl=${callback}`} className={buttonClasses("secondary")}>
            Create account
          </Link>
        </div>
      </div>
    );
  }

  function borrow() {
    startTransition(async () => {
      const result = await borrowAction(bookId);
      if (result.ok) {
        setBorrowed(true);
        setMessage({ text: "Borrowed. Your shelf will update." });
      } else {
        setMessage({ text: result.error, error: true });
      }
    });
  }

  function rate(value: number) {
    const previous = rating;
    setRating(value); // optimistic; rolled back on failure
    startTransition(async () => {
      const result = await rateAction(bookId, value);
      if (result.ok) {
        setMessage({ text: `Rated ${value}★. Your shelf will update.` });
      } else {
        setRating(previous);
        setMessage({ text: result.error, error: true });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Button onClick={borrow} disabled={borrowed || pending} variant={borrowed ? "secondary" : "primary"}>
          {borrowed ? "Borrowed" : "Borrow"}
        </Button>
      </div>
      <div>
        <p className="font-bold">{rating ? "Your rating" : "Rate this book"}</p>
        <StarRating value={rating} onChange={rate} label="Rate this book" className="-ml-2" />
      </div>
      <p
        role="status"
        aria-live="polite"
        className={message?.error ? "min-h-6 text-danger" : "min-h-6 text-shelf"}
      >
        {message?.text}
      </p>
    </div>
  );
}
