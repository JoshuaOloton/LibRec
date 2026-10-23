import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BookCover } from "@/components/book-cover";
import { EmptyState } from "@/components/empty-state";
import { LoanButtons } from "@/components/loan-buttons";
import { buttonClasses } from "@/components/ui/button";
import { formatNaira, lateFeePerDay, maxRenewals, renewalDays, type LoanStatus } from "@/lib/loans";
import { listLoans } from "@/server/services/interactions";

export const metadata: Metadata = { title: "My loans" };
// Status and late fees depend on the current time.
export const dynamic = "force-dynamic";

type Loans = Awaited<ReturnType<typeof listLoans>>;
type Loan = Loans["active"][number];

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const date = (d: Date) => dateFormat.format(d);

const STATUS: Record<Exclude<LoanStatus, "RETURNED">, { label: (l: Loan) => string; className: string }> = {
  ON_LOAN: { label: (l) => `${l.daysLeft} days left`, className: "text-ink-muted" },
  DUE_SOON: {
    label: (l) => (l.daysLeft <= 1 ? "Due within a day" : `Due in ${l.daysLeft} days`),
    className: "font-bold text-ink",
  },
  OVERDUE: { label: () => "Overdue", className: "font-bold text-danger" },
};

export default async function LoansPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Floans");

  const { active, returned } = await listLoans(Number(session.user.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl">My loans</h1>
        <p className="mt-1 max-w-prose text-ink-muted">
          Borrowing is free. If a book comes back late, a fee of {formatNaira(lateFeePerDay)} a day applies. You can
          renew each loan {maxRenewals === 1 ? "once" : `${maxRenewals} times`}, for {renewalDays} more days, before it
          is overdue.
        </p>
      </div>

      <section aria-labelledby="on-loan" className="space-y-4">
        <h2 id="on-loan" className="text-xl">
          On loan
        </h2>
        {active.length === 0 ? (
          <EmptyState
            title="Nothing on loan"
            action={
              <Link href="/catalogue" className={buttonClasses("primary")}>
                Browse the catalogue
              </Link>
            }
          >
            Borrow a book from its page and it will show up here with its due date.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {active.map((loan) => (
              <ActiveLoan key={loan.bookId} loan={loan} />
            ))}
          </ul>
        )}
      </section>

      {returned.length > 0 && (
        <section aria-labelledby="returned" className="space-y-4">
          <h2 id="returned" className="text-xl">
            Returned
          </h2>
          <ul className="divide-y divide-rule">
            {returned.map((loan) => (
              <li key={loan.bookId} className="flex gap-4 py-4">
                <Cover loan={loan} />
                <div>
                  <BookTitle loan={loan} />
                  <p className="text-ink-muted">
                    Borrowed {date(loan.borrowedAt)}, returned {date(loan.returnedAt!)}
                  </p>
                  {loan.lateFee > 0 && (
                    <p className="text-ink-muted">Returned late. Late fee {formatNaira(loan.lateFee)}.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Cover({ loan }: { loan: Loan }) {
  return (
    <Link href={`/book/${loan.bookId}`} className="block w-16 shrink-0 self-start sm:w-20" tabIndex={-1} aria-hidden>
      <BookCover
        title={loan.book.title}
        author={loan.book.author}
        genre={loan.book.genres[0]}
        coverUrl={loan.book.coverUrl}
        sizes="80px"
      />
    </Link>
  );
}

function BookTitle({ loan }: { loan: Loan }) {
  return (
    <>
      <h3 className="text-base leading-snug font-medium">
        <Link href={`/book/${loan.bookId}`} className="hover:underline">
          {loan.book.title}
        </Link>
      </h3>
      <p className="text-ink-muted">{loan.book.author}</p>
    </>
  );
}

function ActiveLoan({ loan }: { loan: Loan }) {
  const status = STATUS[loan.status as keyof typeof STATUS];
  return (
    <li className="flex gap-4 py-4">
      <Cover loan={loan} />
      <div className="min-w-0 flex-1 space-y-2">
        <BookTitle loan={loan} />
        <p>
          <span className={status.className}>{status.label(loan)}</span>
          <span className="text-ink-muted">
            {" "}
            · due {date(loan.dueAt)} · borrowed {date(loan.borrowedAt)}
          </span>
        </p>
        {loan.status === "OVERDUE" && (
          <p className="text-danger">
            Late fee so far: {formatNaira(loan.lateFee)}. Return the book to stop it growing.
          </p>
        )}
        {loan.renewals > 0 && <p className="text-ink-muted">Renewed {loan.renewals === 1 ? "once" : `${loan.renewals} times`}.</p>}
        <LoanButtons bookId={loan.bookId} canRenew={loan.canRenew} />
      </div>
    </li>
  );
}
