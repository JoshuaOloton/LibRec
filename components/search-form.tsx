import { cn } from "@/lib/utils";

/** Plain GET form to the catalogue: works without JavaScript and keeps URLs shareable. */
export function SearchForm({
  defaultValue = "",
  genre,
  className,
  id = "search",
}: {
  defaultValue?: string;
  genre?: string;
  className?: string;
  id?: string;
}) {
  return (
    <form action="/catalogue" role="search" className={cn("flex w-full gap-2", className)}>
      <label htmlFor={id} className="sr-only">
        Search by title, author or genre
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search by title, author or genre"
        autoComplete="off"
        className="min-h-11 w-full min-w-0 rounded-md border border-rule bg-surface px-3 text-base placeholder:text-ink-muted"
      />
      {genre && <input type="hidden" name="genre" value={genre} />}
      <button
        type="submit"
        className="min-h-11 shrink-0 rounded-md bg-shelf px-4 font-bold text-surface hover:bg-shelf-deep"
      >
        Search
      </button>
    </form>
  );
}
