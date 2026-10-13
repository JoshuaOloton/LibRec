import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function Page({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Create your account</h1>
      <p className="mt-1 mb-6 text-ink-muted">Rate or borrow a few books and LibRec will start suggesting more, with a reason for each.</p>
      <AuthForm mode="register" redirectTo={callbackUrl} />
    </>
  );
}
