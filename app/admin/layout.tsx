import Link from "next/link";
import { requireAdmin } from "@/server/services/auth";

// Every admin page re-checks the role here; the proxy is only an optimistic first line.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="grid gap-6 md:grid-cols-[180px_1fr] md:gap-8">
      <nav aria-label="Admin" className="md:border-r md:border-rule md:pr-4">
        <ul className="flex gap-2 md:flex-col">
          <li>
            <Link
              href="/admin/books"
              className="inline-flex min-h-11 w-full items-center rounded-md px-3 font-bold hover:bg-surface"
            >
              Books
            </Link>
          </li>
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
