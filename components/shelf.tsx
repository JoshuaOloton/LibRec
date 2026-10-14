import { BookActions } from "@/components/book-actions";
import { BookCard } from "@/components/book-card";
import { Fade } from "@/components/shelf-fade";
import type { ServedItem } from "@/server/services/recommendations";

/**
 * Your shelf (STYLE.md): the top pick larger with the brass marker and its own Borrow / Rate, the rest as one row
 * (horizontal scroll-snap on mobile, a grid from lg). Every item carries its reason slip.
 */
export function ShelfView({ items }: { items: ServedItem[] }) {
  const [top, ...rest] = items;
  if (!top) return null;
  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <Fade id={top.book.id} className="w-3/4 max-w-xs space-y-4 sm:w-72 lg:w-full">
        <BookCard book={top.book} reason={top.reason} alsoRated={top.alsoRated} topPick priority />
        <BookActions bookId={top.book.id} signedIn borrowed={false} rating={0} />
      </Fade>

      {rest.length > 0 && (
        <ul
          aria-label="More picks"
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-x-5 lg:gap-y-8 lg:overflow-visible lg:px-0 xl:grid-cols-4"
        >
          {rest.map((item) => (
            <li key={item.book.id} className="w-36 shrink-0 snap-start sm:w-40 lg:w-auto">
              <Fade id={item.book.id}>
                <BookCard book={item.book} reason={item.reason} alsoRated={item.alsoRated} />
              </Fade>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A plain row of recommended books with reason slips ("More like this" on the book page). */
export function BookRow({ items, label }: { items: ServedItem[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-x-5 lg:overflow-visible lg:px-0"
    >
      {items.map((item) => (
        <li key={item.book.id} className="w-36 shrink-0 snap-start sm:w-40 lg:w-auto">
          <BookCard book={item.book} reason={item.reason} />
        </li>
      ))}
    </ul>
  );
}
