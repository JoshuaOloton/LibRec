# Decisions

| Date | Decision | Reason |
|------|----------|--------|
| 2026-10-06 | Product name: LibRec | Short, descriptive |
| 2026-10-06 | Full Next.js (TypeScript) stack; pivot to Next.js + FastAPI only if needed | One codebase, simpler single-host deploy |
| 2026-10-06 | One-off data prep in Python (scripts/data/), never deployed | pandas convenience; app and evaluation stay TypeScript |
| 2026-10-06 | PostgreSQL + Prisma | Report specifies a relational five-entity schema |
| 2026-10-06 | Dataset: goodbooks-10k (original release, ~982k ratings) | Clean 1–5 ratings; Book-Crossing rejected (no genre or description) |
| 2026-10-06 | Option C book text: genre tags + author + description | Report names genre, author and description as TF-IDF inputs |
| 2026-10-06 | Descriptions fetched from Open Library, then Google Books | goodbooks has no description field |
| 2026-10-06 | Ratings per user: min 3, max 30, skewed (~20% 3–4, ~60% 5–15, ~20% 16–30); min-3 applied at end of step 6 | Every user testable; keeps a cold-start segment; library-like sparsity |
| 2026-10-06 | Null-language books kept and re-checked after enrichment | Avoid losing ~1,000 books unnecessarily |
| 2026-10-07 | Book de-duplication key: full lowercased title (series suffix kept) + first author; keep the most-rated copy; remap its ratings and to_read rows; 1 pair merged (*'Salem's Lot*, 1292 → 349) | A looser key (series suffix stripped) wrongly merged distinct *Avatar: The Last Airbender* volumes; the strict key is conservative |
| 2026-10-06 | Canonical book id = books.csv `id`; Goodreads id kept as `goodreads_id` | Matches ratings/book_tags/to_read |
| 2026-10-06 | UI per docs/STYLE.md (Literata + Atkinson Hyperlegible, library green, reason slip) | Educational, readable, makes "why" visible (NFR1) |

## Open (decide before the cycle shown)

| # | Question | Needed by | Suggested default |
|---|----------|-----------|-------------------|
| 1 | Borrow → rating value for Pearson | Cycle 3 | 3.5 if not rated |
| 2 | What counts toward the 3-interaction threshold | Cycle 4 | Any interaction |
| 3 | Score for books with no ratings (item cold-start) | Cycle 4 | contentWeight × A |
| 4 | What is a "relevant" held-out item | Cycle 2 | rating ≥ 4, or any borrow |
| 5 | Top-N for evaluation | Cycle 2 | 10 |
| 6 | Significance test | Cycle 5 | Paired t-test across seeds |
