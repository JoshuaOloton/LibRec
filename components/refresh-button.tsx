"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Re-run the recommender for the current page (the server component renders again; nothing is refit). */
export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? "Refreshing…" : label}
    </Button>
  );
}
