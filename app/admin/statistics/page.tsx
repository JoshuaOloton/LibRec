import type { Metadata } from "next";
import Link from "next/link";
import { getStatistics, type MonthBucket, type RankedBook } from "@/server/services/statistics";

export const metadata: Metadata = { title: "Statistics" };
// Always computed from the current interactions and log.
export const dynamic = "force-dynamic";

const SOURCE_LABEL = { CONTENT: "Content-based", COLLABORATIVE: "Collaborative", HYBRID: "Hybrid" } as const;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default async function StatisticsPage() {
  const s = await getStatistics();
  const t = s.totals;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl sm:text-3xl">Statistics</h1>
        <p className="mt-1 max-w-prose text-ink-muted">
          {t.books.toLocaleString()} books, {t.patrons.toLocaleString()} patrons, {t.borrows.toLocaleString()} borrows,{" "}
          {t.ratings.toLocaleString()} ratings and {t.logged.toLocaleString()} recommendations served.
        </p>
      </div>

      <Section title="Most borrowed books">
        <Ranking rows={s.mostBorrowed} unit="borrows" empty="No borrows have been recorded yet." />
      </Section>

      <Section title="Most rated books">
        <Ranking rows={s.mostRated} unit="ratings" showMean empty="No ratings have been recorded yet." />
      </Section>

      <Section
        title="Interactions over time"
        note="Timestamps in the dataset are synthetic: the borrows and ratings loaded from the dataset were given dates between September 2024 and June 2025, so the shape of that period says nothing about real library use. Only the bars marked “recorded in the app” have real timestamps."
      >
        <OverTime months={s.interactionsOverTime} />
      </Section>

      <Section
        title="Unread holdings"
        note="Books that no patron has borrowed or rated."
      >
        <p>
          <strong>{s.unreadHoldings.count.toLocaleString()}</strong> of {t.books.toLocaleString()} books ({pct(s.unreadHoldings.share)})
          have never been borrowed or rated.
        </p>
        {s.unreadHoldings.sample.length > 0 && (
          <Table caption={`Unread holdings (first ${s.unreadHoldings.sample.length}, by title)`} head={["Title", "Author"]}>
            {s.unreadHoldings.sample.map((b) => (
              <tr key={b.bookId} className="border-t border-rule">
                <td className="py-2 pr-4">
                  <Link href={`/book/${b.bookId}`} className="underline">
                    {b.title}
                  </Link>
                </td>
                <td className="py-2 text-ink-muted">{b.author}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="Recommendation source mix"
        note="Which component produced each recommendation served so far, from the recommendation log."
      >
        {s.sourceMix.length === 0 ? (
          <p className="text-ink-muted">No recommendations have been served yet. Open Your shelf as a patron to create some.</p>
        ) : (
          <ul className="space-y-3">
            {s.sourceMix.map((m) => (
              <li key={m.source}>
                <div className="flex justify-between gap-4">
                  <span>{SOURCE_LABEL[m.source]}</span>
                  <span className="text-ink-muted">
                    {m.count.toLocaleString()} ({pct(m.share)})
                  </span>
                </div>
                <Bar value={m.share} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 bg-surface p-4 sm:p-6">
      <h2 className="text-xl">{title}</h2>
      {note && <p className="max-w-prose text-sm text-ink-muted">{note}</p>}
      {children}
    </section>
  );
}

/** A horizontal bar in a shelf tint. `value` is 0 to 1. */
function Bar({ value, accent = false }: { value: number; accent?: boolean }) {
  return (
    <div aria-hidden className="mt-1 h-2 w-full bg-shelf/10">
      <div className={accent ? "h-2 bg-brass" : "h-2 bg-shelf"} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function Table({ caption, head, children }: { caption: string; head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-sm text-ink-muted">
          {head.map((h) => (
            <th key={h} scope="col" className="pb-2 font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Ranking({ rows, unit, showMean = false, empty }: { rows: RankedBook[]; unit: string; showMean?: boolean; empty: string }) {
  if (rows.length === 0) return <p className="text-ink-muted">{empty}</p>;
  const max = rows[0].count;
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.bookId}>
          <div className="flex flex-wrap justify-between gap-x-4">
            <span>
              <Link href={`/book/${r.bookId}`} className="font-medium underline">
                {r.title}
              </Link>{" "}
              <span className="text-ink-muted">{r.author}</span>
            </span>
            <span className="text-ink-muted">
              {r.count.toLocaleString()} {unit}
              {showMean && r.meanRating !== undefined && `, mean ${r.meanRating.toFixed(2)}★`}
            </span>
          </div>
          <Bar value={r.count / max} accent={i === 0} />
        </li>
      ))}
    </ol>
  );
}

function OverTime({ months }: { months: MonthBucket[] }) {
  if (months.length === 0) return <p className="text-ink-muted">No interactions have been recorded yet.</p>;
  const max = Math.max(...months.map((m) => m.synthetic + m.recorded));
  const peak = months.find((m) => m.synthetic + m.recorded === max)!;
  return (
    <div className="space-y-3">
      <ul className="flex h-40 items-end gap-1 overflow-x-auto" aria-label="Interactions per month">
        {months.map((m) => {
          const total = m.synthetic + m.recorded;
          return (
            <li key={m.month} className="flex h-full min-w-3 flex-1 flex-col justify-end" title={`${m.month}: ${total}`}>
              <div className={m === peak ? "bg-brass/70" : "bg-shelf/30"} style={{ height: `${(m.synthetic / max) * 100}%` }} />
              <div className="bg-shelf" style={{ height: `${(m.recorded / max) * 100}%` }} />
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
        <span>
          <span aria-hidden className="mr-1.5 inline-block size-3 bg-shelf/30 align-middle" />
          Synthetic timestamps (dataset and demo accounts)
        </span>
        <span>
          <span aria-hidden className="mr-1.5 inline-block size-3 bg-shelf align-middle" />
          Recorded in the app (real timestamps)
        </span>
        <span>
          <span aria-hidden className="mr-1.5 inline-block size-3 bg-brass/70 align-middle" />
          Busiest month
        </span>
      </p>
      <Table caption="Interactions per month" head={["Month", "Synthetic", "Recorded in the app"]}>
        {months.map((m) => (
          <tr key={m.month} className="border-t border-rule">
            <td className="py-1.5 pr-4">{m.month}</td>
            <td className="py-1.5 pr-4">{m.synthetic.toLocaleString()}</td>
            <td className="py-1.5">{m.recorded.toLocaleString()}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
