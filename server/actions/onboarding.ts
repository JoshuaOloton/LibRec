"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GENRE_COOKIE, GENRE_COOKIE_MAX_AGE } from "@/lib/onboarding";
import { validGenres } from "@/server/services/recommendations";

/** Save the picked genres and go straight to Your shelf (TC15). Picks are checked against the catalogue's genres. */
export async function saveGenresAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fonboarding");

  const genres = await validGenres(formData.getAll("genre").map(String));
  if (genres.length === 0) redirect("/onboarding");

  (await cookies()).set(GENRE_COOKIE, genres.join(","), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: GENRE_COOKIE_MAX_AGE,
  });
  redirect("/recommendations");
}
