/**
 * TF-IDF input for a book: genres (hyphens as spaces) + author + description, the same shape the
 * Cycle 0 pipeline produced (build_text.py), so admin-added books are comparable with the dataset.
 */
export function buildContentText(book: { genres: string[]; author: string; description?: string | null }) {
  const genres = book.genres.map((g) => g.replace(/-/g, " ")).join(", ");
  return [genres, book.author.trim(), book.description?.trim() ?? ""].filter(Boolean).join(". ");
}
