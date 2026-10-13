import { BookCardSkeleton } from "@/components/book-card";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading catalogue">
      <div className="skeleton h-9 w-48 rounded-sm" />
      <div className="skeleton h-11 w-full rounded-full" />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i}>
            <BookCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
