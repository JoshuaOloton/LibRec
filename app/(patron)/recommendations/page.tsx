import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EmptyState } from "@/components/empty-state";
import { RefreshButton } from "@/components/refresh-button";
import { ShelfView } from "@/components/shelf";
import { buttonClasses } from "@/components/ui/button";
import { GENRE_COOKIE, parseGenreCookie } from "@/lib/onboarding";
import { genreLabel } from "@/lib/utils";
import { getShelf } from "@/server/services/recommendations";

export const metadata: Metadata = { title: "Your shelf" };

/** Names for the "Picked from ..." line: "Fantasy", "Fantasy and mystery", "Fantasy, mystery and classics". */
function list(names: string[]) {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default async function YourShelfPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Frecommendations");

  const picked = parseGenreCookie((await cookies()).get(GENRE_COOKIE)?.value);
  const shelf = await getShelf(Number(session.user.id), picked); // logs every served item before it returns
  if (shelf.kind === "onboarding") redirect("/onboarding");

  const source =
    shelf.path === "genres"
      ? `Picked from your interest in ${list(shelf.genres.map((g) => genreLabel(g).toLowerCase()))}.`
      : `Picked from ${shelf.basedOn === 1 ? "the book" : `${shelf.basedOn} books`} you’ve rated or borrowed.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">Your shelf</h1>
          <p className="mt-1 max-w-prose text-ink-muted">{source}</p>
        </div>
        <div className="flex gap-2">
          {shelf.path === "genres" && (
            <Link href="/onboarding" className={buttonClasses("secondary")}>
              Change subjects
            </Link>
          )}
          <RefreshButton />
        </div>
      </div>

      {shelf.items.length === 0 ? (
        <EmptyState
          title="No picks yet"
          action={
            <Link href="/catalogue" className={buttonClasses("primary")}>
              Browse the catalogue
            </Link>
          }
        >
          Nothing new matches what you’ve read so far. Rate or borrow a few more books and check back.
        </EmptyState>
      ) : (
        <ShelfView items={shelf.items} />
      )}
    </div>
  );
}
