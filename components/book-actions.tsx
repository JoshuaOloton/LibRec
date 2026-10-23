"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { StarRating } from "@/components/star-rating";
import { useHydrated } from "@/components/use-hydrated";
import { Button, buttonClasses } from "@/components/ui/button";
import { addDays, defaultLoanDays, formatNaira, lateFeePerDay, loanPeriodOptions } from "@/lib/loans";
import { borrowAction, rateAction, returnAction } from "@/server/actions/interactions";

type Props = {
  bookId: number;
  signedIn: boolean;
  /** True while the patron has this book out (borrowed in the app and not returned). */
  onLoan: boolean;
  /** ISO due date of the current loan. */
  dueAt?: string | null;
  rating: number;
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Borrow (with a loan-length prompt), Return and Rate (FR3). A short status message confirms each action, as STYLE.md asks. */
export function BookActions({ bookId, signedIn, onLoan: initialOnLoan, dueAt: initialDueAt = null, rating: initialRating }: Props) {
  const [onLoan, setOnLoan] = useState(initialOnLoan);
  const [dueAt, setDueAt] = useState(initialDueAt);
  const [choosing, setChoosing] = useState(false);
  const [days, setDays] = useState<number>(defaultLoanDays);
  const [rating, setRating] = useState(initialRating);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated(); // a Borrow tap before hydration would be lost, like a star tap

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
      const result = await borrowAction(bookId, days);
      if (result.ok) {
        setOnLoan(true);
        setDueAt(result.dueAt);
        setChoosing(false);
        setMessage({ text: `Borrowed until ${dateFormat.format(new Date(result.dueAt))}. See it under My loans.` });
      } else {
        setMessage({ text: result.error, error: true });
      }
    });
  }

  function giveBack() {
    startTransition(async () => {
      const result = await returnAction(bookId);
      if (result.ok) {
        setOnLoan(false);
        setDueAt(null);
        setMessage({ text: "Returned. Thank you." });
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
      {onLoan ? (
        <div className="space-y-2">
          <p>
            <span className="font-bold">On loan</span>
            {dueAt && <>, due {dateFormat.format(new Date(dueAt))}</>}.{" "}
            <Link href="/loans" className="underline">
              My loans
            </Link>
          </p>
          <Button onClick={giveBack} disabled={pending || !hydrated} variant="secondary">
            Return book
          </Button>
        </div>
      ) : choosing ? (
        <fieldset className="max-w-sm space-y-3 border-l-[3px] border-rule pl-4">
          <legend className="font-bold">How long do you need it?</legend>
          <div className="flex flex-wrap gap-2">
            {loanPeriodOptions.map((d) => (
              <label
                key={d}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 font-bold ${
                  days === d ? "border-shelf bg-surface" : "border-rule"
                }`}
              >
                <input
                  type="radio"
                  name="loan-days"
                  value={d}
                  checked={days === d}
                  onChange={() => setDays(d)}
                  className="sr-only"
                />
                {d} days
              </label>
            ))}
          </div>
          <p className="text-ink-muted">
            Due back on {dateFormat.format(addDays(new Date(), days))}. There is no charge to borrow. If it is
            late, a fee of {formatNaira(lateFeePerDay)} a day applies. You can renew once, for 7 more days.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={borrow} disabled={pending || !hydrated}>
              Confirm borrow
            </Button>
            <Button onClick={() => setChoosing(false)} disabled={pending} variant="secondary">
              Cancel
            </Button>
          </div>
        </fieldset>
      ) : (
        <div>
          <Button onClick={() => setChoosing(true)} disabled={pending || !hydrated}>
            Borrow
          </Button>
        </div>
      )}
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
