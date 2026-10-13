import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BookCard } from "@/components/book-card";
import { EmptyState } from "@/components/empty-state";
import { StarRating } from "@/components/star-rating";
import { buttonClasses } from "@/components/ui/button";
import { listUserInteractions } from "@/server/services/interactions";

export const metadata: Metadata = { title: "Your shelf" };

/**
 * Placeholder until the engine lands (Cycles 2–5). For now it shows the patron's own history, which
 * is what the recommendations will be built from.
 */
export default async function YourShelfPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Frecommendations");

  const history = await listUserInteractions(Number(session.user.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl">Your shelf</h1>
        <p className="mt-1 max-w-prose text-ink-muted">
          Recommendations will appear here, each with the reason it was picked. For now, this is what they will be
          built from: the {history.length === 1 ? "book" : `${history.length} books`} you’ve rated or borrowed.
        </p>
      </div>

      {history.length === 0 ? (
        <EmptyState
          title="Your shelf is empty"
          action={
            <Link href="/catalogue" className={buttonClasses("primary")}>
              Browse the catalogue
            </Link>
          }
        >
          Rate or borrow a few books and they’ll show up here.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {history.map((row) => (
            <li key={row.bookId}>
              <BookCard book={row.book} />
              <p className="mt-1 text-sm text-ink-muted">
                {row.type === "RATE" && row.ratingValue ? (
                  <StarRating readOnly value={row.ratingValue} />
                ) : (
                  "Borrowed"
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
