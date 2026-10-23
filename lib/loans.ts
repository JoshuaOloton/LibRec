/**
 * Loan rules for the "My loans" page. Pure and framework-free, so the numbers are unit-tested and the
 * UI and the server actions read the same constants. The loan is free; only a late fee can accrue,
 * and it is shown as an amount, never charged (the prototype has no payment).
 */

export const loanPeriodOptions = [7, 14, 21] as const;
export const defaultLoanDays = 14;
export const maxRenewals = 1;
export const renewalDays = 7;
export const lateFeePerDay = 50; // naira per day after the due date
export const dueSoonDays = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LoanStatus = "ON_LOAN" | "DUE_SOON" | "OVERDUE" | "RETURNED";

export function isLoanPeriod(days: number): boolean {
  return (loanPeriodOptions as readonly number[]).includes(days);
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

export function computeDueAt(borrowedAt: Date, days: number): Date {
  return addDays(borrowedAt, days);
}

/** Whole days past the due date, rounded up (one hour late is one day late); 0 on or before it. */
export function daysOverdue(dueAt: Date, now: Date): number {
  const late = now.getTime() - dueAt.getTime();
  return late > 0 ? Math.ceil(late / DAY_MS) : 0;
}

export function lateFee(dueAt: Date, now: Date, returnedAt?: Date | null): number {
  return daysOverdue(dueAt, returnedAt ?? now) * lateFeePerDay;
}

/** Whole days left until the due date, rounded up; 0 once it has passed. */
export function daysLeft(dueAt: Date, now: Date): number {
  const left = dueAt.getTime() - now.getTime();
  return left > 0 ? Math.ceil(left / DAY_MS) : 0;
}

export function loanStatus(
  loan: { dueAt: Date | null; returnedAt: Date | null },
  now: Date,
): LoanStatus {
  if (loan.returnedAt) return "RETURNED";
  if (!loan.dueAt) return "ON_LOAN";
  if (daysOverdue(loan.dueAt, now) > 0) return "OVERDUE";
  return daysLeft(loan.dueAt, now) <= dueSoonDays ? "DUE_SOON" : "ON_LOAN";
}

/** A renewal is allowed once per loan, and only while the book is out and not yet overdue. */
export function canRenew(
  loan: { dueAt: Date | null; returnedAt: Date | null; renewals: number },
  now: Date,
): boolean {
  if (loan.returnedAt || !loan.dueAt) return false;
  return loan.renewals < maxRenewals && daysOverdue(loan.dueAt, now) === 0;
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}
