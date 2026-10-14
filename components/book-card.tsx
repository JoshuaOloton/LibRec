import Link from "next/link";
import { BookCover } from "@/components/book-cover";
import { ReasonSlip, type Reason } from "@/components/reason-slip";
import { cn } from "@/lib/utils";

export type BookSummary = {
  id: number;
  title: string;
  author: string;
  genres: string[];
  coverUrl: string | null;
};

type Props = {
  book: BookSummary;
  /** Present on recommendations; the slip sits directly under the cover. */
  reason?: Reason;
  /** CF prediction (>= 4.0) for the slip's second line. */
  alsoRated?: number;
  /** Larger treatment with the brass marker, for the first pick on Your shelf. */
  topPick?: boolean;
  priority?: boolean;
  className?: string;
};

/** Cover on the paper, no box, border or shadow (STYLE.md). Reason slip, title, author below. */
export function BookCard({ book, reason, alsoRated, topPick = false, priority, className }: Props) {
  return (
    <article className={cn("flex flex-col", className)}>
      <Link href={`/book/${book.id}`} className="group block rounded-cover">
        <BookCover
          title={book.title}
          author={book.author}
          genre={book.genres[0]}
          coverUrl={book.coverUrl}
          priority={priority}
          sizes={topPick ? "(min-width: 1024px) 320px, 80vw" : undefined}
        />
        {topPick && (
          <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold">
            <svg viewBox="0 0 12 16" aria-hidden className="h-4 w-3">
              <path d="M1 1h10v14l-5-3.5L1 15z" fill="var(--brass)" />
            </svg>
            Top pick
          </span>
        )}
      </Link>
      {reason && <ReasonSlip reason={reason} alsoRated={alsoRated} className="mt-2" />}
      <h3 className="mt-2 text-base leading-snug font-medium">
        <Link href={`/book/${book.id}`} className="hover:underline">
          {book.title}
        </Link>
      </h3>
      <p className="text-sm text-ink-muted">{book.author}</p>
    </article>
  );
}

export function BookCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="skeleton aspect-[2/3] w-full rounded-cover" />
      <div className="skeleton mt-3 h-4 w-4/5 rounded-sm" />
      <div className="skeleton mt-2 h-3.5 w-1/2 rounded-sm" />
    </div>
  );
}
