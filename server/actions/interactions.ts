"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { InvalidRatingError, recordBorrow, recordRating } from "@/server/services/interactions";

export type InteractionResult = { ok: true } | { ok: false; error: string };

async function patronId() {
  const session = await auth();
  return session?.user ? Number(session.user.id) : null;
}

const NOT_SIGNED_IN = "Log in to borrow or rate books.";
const FAILED = "That didn’t save. Check your connection and try again.";

export async function borrowAction(bookId: number): Promise<InteractionResult> {
  const userId = await patronId();
  if (!userId) return { ok: false, error: NOT_SIGNED_IN };
  try {
    await recordBorrow(userId, bookId);
  } catch {
    return { ok: false, error: FAILED };
  }
  revalidatePath("/recommendations");
  return { ok: true };
}

/**
 * `refreshShelf: false` is for onboarding: revalidating makes the server re-render the page the patron is on, and
 * /onboarding redirects anyone with a history to Your shelf, which would cut "rate a few books" short after one.
 */
export async function rateAction(
  bookId: number,
  value: number,
  { refreshShelf = true }: { refreshShelf?: boolean } = {},
): Promise<InteractionResult> {
  const userId = await patronId();
  if (!userId) return { ok: false, error: NOT_SIGNED_IN };
  try {
    await recordRating(userId, bookId, value);
  } catch (err) {
    return { ok: false, error: err instanceof InvalidRatingError ? err.message : FAILED };
  }
  if (refreshShelf) revalidatePath("/recommendations");
  return { ok: true };
}
