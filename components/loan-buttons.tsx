"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useHydrated } from "@/components/use-hydrated";
import { Button } from "@/components/ui/button";
import { renewAction, returnAction } from "@/server/actions/interactions";

/** Return and Renew for one loan on My loans. The page re-renders from the server after each action. */
export function LoanButtons({ bookId, canRenew }: { bookId: number; canRenew: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  function run(action: (id: number) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(bookId);
      if (result.ok) router.refresh();
      else setError(result.error ?? "That didn’t save. Check your connection and try again.");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run(returnAction)} disabled={pending || !hydrated} variant="secondary">
          Return
        </Button>
        {canRenew && (
          <Button onClick={() => run(renewAction)} disabled={pending || !hydrated} variant="secondary">
            Renew
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="min-h-6 text-danger">
        {error}
      </p>
    </div>
  );
}
