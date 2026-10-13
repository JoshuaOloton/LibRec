import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Log in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Log in</h1>
      <p className="mt-1 mb-6 text-ink-muted">Log in to see your shelf and rate books.</p>
      <AuthForm mode="login" redirectTo={callbackUrl} />
    </>
  );
}
