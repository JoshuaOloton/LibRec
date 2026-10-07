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
| 2026-10-06 | Ratings per user: min 3, max 30; min-3 applied at end of step 6. (Target distribution ~20/60/20 superseded 2026-10-07 below) | Every user testable; keeps a cold-start segment; library-like sparsity |
| 2026-10-06 | Null-language books kept and re-checked after enrichment | Avoid losing ~1,000 books unnecessarily |
| 2026-10-07 | Book de-duplication key: full lowercased title (series suffix kept) + first author; keep the most-rated copy; remap its ratings and to_read rows; 1 pair merged (*'Salem's Lot*, 1292 → 349) | A looser key (series suffix stripped) wrongly merged distinct *Avatar: The Last Airbender* volumes; the strict key is conservative |
| 2026-10-07 | Genre whitelist: 44 genres built from merged tags (scripts/data/genre_whitelist.py); each book gets its top 3 by raw tag count | Simple and reproducible; ties broken alphabetically |
| 2026-10-07 | Audience and format categories (young-adult, classics, childrens, graphic-novels, etc.) kept in the whitelist | Useful TF-IDF signal for a library catalogue |
| 2026-10-07 | `chick-lit` renamed `womens-fiction` (raw tag still `chick-lit`) | More neutral label for the UI |
| 2026-10-07 | `erotica` not whitelisted; books with erotica in their top 3 are excluded from the catalogue, with their ratings, to_read and tag rows. 238 books, 22,798 ratings, 8,673 to_read rows removed (ids in cleaning_report.json) | Catalogue curated for an academic library |
| 2026-10-07 | Catalogue limited to 1,000 books (select_catalogue.py, after genre assignment): ≥10 most-rated books per primary genre (all if fewer; primary = first of the top-3 genres), remaining slots filled by most-rated overall; ratings, to_read and tag rows of other books dropped. Result: 420 guaranteed + 580 filled; keeps 99,989 ratings (10.2% of the original 981,756). Cached descriptions for books outside the selection are kept in data/cache but unused | Prototype scale; well above the 727-book benchmark in the report |
| 2026-10-07 | Step 6: keep all users with ≥3 ratings (no sampling down), cap each at 30 at random (seeded), accept and report the natural distribution; no ~20/60/20 target | Realistic library skew; gives a large cold-start segment for the switching-rule analysis |
| 2026-10-07 | Step 5: `content_text` = genres (hyphens as spaces) + first author + cleaned description. Cleaning strips HTML/markdown and boilerplate ("Book #2", content warnings), and drops sentences with ≥70% word overlap with an earlier sentence (fixes duplicated blurbs). 963 of 1,000 books have a description; the other 37 keep genres + author. Mean `content_text` 704 chars (~117 words) | Keeps TF-IDF from over-weighting repeated blurb text |
| 2026-10-07 | Null-language books: 46 re-checked with a stopword heuristic on the description. *Watchers* (799) had a French blurb from a wrong-edition match, so its description was discarded and the book kept (genres + author). 6 with no description kept and listed as unverifiable. None dropped | The book is English; only the matched blurb was wrong |
| 2026-10-07 | Step 6 result (seed 42): 1,000 books; 11,767 users / 99,989 ratings before cap → cap 30 (random) gives 67,286 → min-3 applied last gives **4,849 users, 58,540 ratings, density 1.21%**, mean 12.1 / median 7 per user. Bands: 3–4 = 1,579 (32.6%), 5–15 = 1,842 (38.0%), 16–30 = 1,428 (29.4%). 6,918 users (59%) were dropped for having <3 ratings on the 1,000-book catalogue | Natural distribution accepted, per the 2026-10-07 Step 6 decision above |
| 2026-10-07 | Evaluation split: hold out ~20% of each test user's interactions, always keeping ≥2 for training. Users whose training count is below `coldStartThreshold` (3) after the split form the **cold-start evaluation segment**; since 1,579 users have only 3–4 ratings, this segment will be large | Gives the switching rule a real cold-start population to be tested on |
| 2026-10-07 | Step 7, simulated borrows (seed 42): (1) each real rating gets a preceding BORROW of the same book with probability 0.5, 3–21 days earlier; (2) each user gets 0–5 extra BORROWs on **unrated** books (P = .35/.25/.20/.10/.06/.04 for 0..5), drawn without replacement from the user's top-2 genres (genre score = sum of ratings), weighted by popularity (rating count + 1), falling back to any unrated book; (3) all timestamps synthetic, uniform within 2024-09-02 to 2025-06-27, each paired borrow before its rating; (4) `simulated` flag on every row (borrows true, ratings false) | goodbooks has no borrows or timestamps; keeps sparsity realistic and borrow-then-rate order plausible. Borrows are taste-consistent by construction, so they favour CBF; report this as a limitation |
| 2026-10-07 | Step 7 result: 36,034 BORROWs (29,367 paired + 6,667 extra) + 58,540 RATEs = **94,574 interactions**, 4,849 users, 65,207 unique user–book pairs, sparsity 98.66% (density 1.35%). Interactions per user: mean 19.5, median 12, min 3, max 58 | Final numbers for the report |
| 2026-10-07 | Step 8 outputs: `books_clean.csv` (book_id, title, author [first author], genres, description, publication_year, isbn, cover_url [blank when a placeholder], content_text), `interactions_clean.csv`, `cleaning_report.md`. `Interaction.rating_value` is null for BORROW rows | Matches the Prisma schema; `coverUrl`, `isbn`, `contentText` are practical additions to the report's schema |
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
