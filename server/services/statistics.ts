import { prisma } from "@/server/db";

export const TOP_N = 10;
export const UNREAD_LIST_LIMIT = 25;

export interface RankedBook {
  bookId: number;
  title: string;
  author: string;
  count: number;
  /** Mean rating, for the most-rated list. */
  meanRating?: number;
}

export interface MonthBucket {
  /** "2025-03" */
  month: string;
  /** Interactions whose timestamps are synthetic: the Cycle 0 dataset and the demo accounts. */
  synthetic: number;
  /** Interactions recorded in the running app, with real timestamps. */
  recorded: number;
}

export interface Statistics {
  totals: { books: number; patrons: number; borrows: number; ratings: number; logged: number };
  mostBorrowed: RankedBook[];
  mostRated: RankedBook[];
  interactionsOverTime: MonthBucket[];
  unreadHoldings: { count: number; share: number; sample: { bookId: number; title: string; author: string }[] };
  sourceMix: { source: "CONTENT" | "COLLABORATIVE" | "HYBRID"; count: number; share: number }[];
}

/**
 * A timestamp is synthetic when the interaction came from the Cycle 0 dataset (its patrons are the seeded
 * `userNNN@librec.test` accounts) or was flagged `simulated` (the demo accounts). Everything else was recorded by the
 * running app and has a real timestamp.
 */
const SYNTHETIC = `(u.email LIKE '%@librec.test' OR i.simulated)`;

/** FR11 / TC13: usage and circulation statistics, computed from the recorded interactions and recommendation log. */
export async function getStatistics(): Promise<Statistics> {
  const [books, patrons, borrows, ratings, logged] = await Promise.all([
    prisma.book.count(),
    prisma.user.count({ where: { role: "PATRON" } }),
    prisma.interaction.count({ where: { type: "BORROW" } }),
    prisma.interaction.count({ where: { type: "RATE" } }),
    prisma.recommendationLog.count(),
  ]);

  const mostBorrowed = await prisma.$queryRaw<{ book_id: number; title: string; author: string; n: bigint }[]>`
    SELECT b.book_id, b.title, b.author, COUNT(*) AS n
    FROM interactions i JOIN books b ON b.book_id = i.book_id
    WHERE i.interaction_type = 'BORROW'
    GROUP BY b.book_id, b.title, b.author
    ORDER BY n DESC, b.title ASC, b.book_id ASC
    LIMIT ${TOP_N}`;

  const mostRated = await prisma.$queryRaw<{ book_id: number; title: string; author: string; n: bigint; mean: number }[]>`
    SELECT b.book_id, b.title, b.author, COUNT(*) AS n, AVG(i.rating_value)::float AS mean
    FROM interactions i JOIN books b ON b.book_id = i.book_id
    WHERE i.interaction_type = 'RATE'
    GROUP BY b.book_id, b.title, b.author
    ORDER BY n DESC, b.title ASC, b.book_id ASC
    LIMIT ${TOP_N}`;

  const months = await prisma.$queryRawUnsafe<{ month: string; synthetic: bigint; recorded: bigint }[]>(`
    SELECT to_char(date_trunc('month', i.timestamp), 'YYYY-MM') AS month,
           COUNT(*) FILTER (WHERE ${SYNTHETIC}) AS synthetic,
           COUNT(*) FILTER (WHERE NOT ${SYNTHETIC}) AS recorded
    FROM interactions i JOIN users u ON u.user_id = i.user_id
    GROUP BY 1 ORDER BY 1`);

  const unreadCount = await prisma.book.count({ where: { interactions: { none: {} } } });
  const unread = await prisma.book.findMany({
    where: { interactions: { none: {} } },
    select: { id: true, title: true, author: true },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    take: UNREAD_LIST_LIMIT,
  });

  const mix = await prisma.recommendationLog.groupBy({ by: ["sourceComponent"], _count: { _all: true } });
  const mixTotal = mix.reduce((s, m) => s + m._count._all, 0);
  const order = ["CONTENT", "COLLABORATIVE", "HYBRID"] as const;

  return {
    totals: { books, patrons, borrows, ratings, logged },
    mostBorrowed: mostBorrowed.map((r) => ({ bookId: r.book_id, title: r.title, author: r.author, count: Number(r.n) })),
    mostRated: mostRated.map((r) => ({
      bookId: r.book_id,
      title: r.title,
      author: r.author,
      count: Number(r.n),
      meanRating: r.mean,
    })),
    interactionsOverTime: months.map((m) => ({ month: m.month, synthetic: Number(m.synthetic), recorded: Number(m.recorded) })),
    unreadHoldings: {
      count: unreadCount,
      share: books === 0 ? 0 : unreadCount / books,
      sample: unread.map((b) => ({ bookId: b.id, title: b.title, author: b.author })),
    },
    sourceMix: order
      .map((source) => ({ source, count: mix.find((m) => m.sourceComponent === source)?._count._all ?? 0 }))
      .filter((m) => m.count > 0)
      .map((m) => ({ ...m, share: mixTotal === 0 ? 0 : m.count / mixTotal })),
  };
}
