import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Server-side admin check. The proxy is only an optimistic first line. */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/catalogue");
  return session.user;
}
