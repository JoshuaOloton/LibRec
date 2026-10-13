import { cn } from "@/lib/utils";

export type Reason =
  | { kind: "rated"; book: string }
  | { kind: "borrowed"; book: string }
  | { kind: "similar-readers"; stars: number }
  | { kind: "interest"; genre: string };

/**
 * The signature element (NFR1): a narrow strip like the slip tucked into a library book, with a
 * 3px shelf-green left edge. Copy follows STYLE.md.
 */
export function ReasonSlip({ reason, className }: { reason: Reason; className?: string }) {
  return (
    <p className={cn("border-l-[3px] border-shelf bg-surface px-2.5 py-1.5 text-sm leading-snug", className)}>
      {copy(reason)}
    </p>
  );
}

function copy(r: Reason) {
  switch (r.kind) {
    case "rated":
      return (
        <>
          Because you rated <em>{r.book}</em>
        </>
      );
    case "borrowed":
      return (
        <>
          Similar to <em>{r.book}</em> you borrowed
        </>
      );
    case "similar-readers":
      return <>Readers with similar taste rated this {r.stars}★</>;
    case "interest":
      return <>Matches your interest in {r.genre}</>;
  }
}
