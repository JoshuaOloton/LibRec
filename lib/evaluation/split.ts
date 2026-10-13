import { mulberry32, shuffle } from "./random";

export interface EvalInteraction {
  userId: number;
  bookId: number;
  type: "BORROW" | "RATE";
  ratingValue: number | null;
}

export interface SplitOptions {
  /** Share of each patron's distinct books held out. */
  holdoutFraction: number;
  /** A patron always keeps at least this many distinct books in training. */
  minTrainBooks: number;
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptions = { holdoutFraction: 0.2, minTrainBooks: 2 };

export interface Split {
  train: EvalInteraction[];
  test: EvalInteraction[];
}

/**
 * Partition at the level of whole (user, book) pairs: every interaction row of a held-out book (borrow and rating)
 * goes to the test set, so a held-out book can never leak through its paired borrow. Deterministic for a given seed.
 */
export function splitInteractions(
  interactions: EvalInteraction[],
  seed: number,
  options: SplitOptions = DEFAULT_SPLIT_OPTIONS,
): Split {
  const byUser = new Map<number, Map<number, EvalInteraction[]>>();
  for (const row of interactions) {
    let books = byUser.get(row.userId);
    if (!books) byUser.set(row.userId, (books = new Map()));
    const rows = books.get(row.bookId);
    if (rows) rows.push(row);
    else books.set(row.bookId, [row]);
  }

  const rand = mulberry32(seed);
  const train: EvalInteraction[] = [];
  const test: EvalInteraction[] = [];
  for (const userId of [...byUser.keys()].sort((a, b) => a - b)) {
    const books = byUser.get(userId)!;
    const bookIds = shuffle([...books.keys()].sort((a, b) => a - b), rand);
    const maxHeldOut = Math.max(0, bookIds.length - options.minTrainBooks);
    const heldOut = new Set(
      bookIds.slice(0, Math.min(maxHeldOut, Math.max(1, Math.round(options.holdoutFraction * bookIds.length)))),
    );
    for (const [bookId, rows] of books) (heldOut.has(bookId) ? test : train).push(...rows);
  }
  return { train, test };
}
