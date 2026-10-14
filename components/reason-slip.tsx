import { alsoRatedText, type Reason } from "@/lib/reason";
import { cn } from "@/lib/utils";

export type { Reason };

/**
 * The signature element (NFR1): a narrow strip like the slip tucked into a library book, with a
 * 3px shelf-green left edge. Copy follows STYLE.md.
 */
export function ReasonSlip({
  reason,
  alsoRated,
  className,
}: {
  reason: Reason;
  /** CF prediction for a weighted-path item; adds the second line when present. */
  alsoRated?: number;
  className?: string;
}) {
  return (
    <p className={cn("border-l-[3px] border-shelf bg-surface px-2.5 py-1.5 text-sm leading-snug", className)}>
      {copy(reason)}
      {alsoRated !== undefined && <span className="mt-0.5 block text-ink-muted">{alsoRatedText(alsoRated)}</span>}
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
    case "similar-to":
      return (
        <>
          Similar to <em>{r.book}</em>
        </>
      );
    case "similar-readers":
      return <>Readers with similar taste rated this {r.stars}★</>;
    case "interest":
      return <>Matches your interest in {r.genre}</>;
  }
}
