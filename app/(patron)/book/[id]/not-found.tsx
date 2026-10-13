import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      title="This book isn’t in the catalogue"
      action={
        <Link href="/catalogue" className={buttonClasses("secondary")}>
          Browse the catalogue
        </Link>
      }
    >
      It may have been removed. Search by title or author to find it.
    </EmptyState>
  );
}
