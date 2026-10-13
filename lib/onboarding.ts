/** Cookie holding a new patron's picked genres (comma-separated slugs). DECISIONS 2026-10-13: no table for these. */
export const GENRE_COOKIE = "librec_genres";

export const GENRE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseGenreCookie(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => /^[a-z0-9-]{1,40}$/.test(g))
    .slice(0, 12);
}
