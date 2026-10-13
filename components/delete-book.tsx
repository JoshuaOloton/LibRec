"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteBookAction } from "@/server/actions/admin-books";

/** Two-step delete without a browser dialog: the first click asks, the second one deletes. */
export function DeleteBook({ id, title, interactions }: { id: number; title: string; interactions: number }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)} className="text-danger">
        Delete book
      </Button>
    );
  }

  return (
    <div role="alertdialog" aria-label={`Delete ${title}`} className="max-w-prose space-y-3 border-l-[3px] border-danger bg-surface p-4">
      <p>
        Delete <em>{title}</em>?{" "}
        {interactions > 0
          ? `This also removes its ${interactions} ${interactions === 1 ? "rating or borrow" : "ratings and borrows"}. `
          : ""}
        This can’t be undone.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" disabled={pending} onClick={() => startTransition(() => deleteBookAction(id))}>
          {pending ? "Deleting…" : "Delete book"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
          Keep book
        </Button>
      </div>
    </div>
  );
}
