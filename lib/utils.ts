import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "science-fiction" -> "Science fiction" (sentence case, per STYLE.md). */
export function genreLabel(genre: string) {
  const s = genre.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
