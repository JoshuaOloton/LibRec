-- Light loan details on BORROW rows: due date, return date and renewal count (docs/DECISIONS.md, 2026-10-23).
-- AlterTable
ALTER TABLE "interactions" ADD COLUMN "due_at" TIMESTAMP(3),
ADD COLUMN "returned_at" TIMESTAMP(3),
ADD COLUMN "renewals" INTEGER NOT NULL DEFAULT 0;
