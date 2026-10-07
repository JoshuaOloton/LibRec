@AGENTS.md

# LibRec: Intelligent Library Book Recommendation System

> Product name: **LibRec** (repo/package name: `librec`). The formal academic title is unchanged.
>
> The app was **already scaffolded with `create-next-app`**. Do not re-scaffold. `AGENTS.md` (imported above) holds the
> Next.js framework guidance, and this file holds the project rules. If the two conflict, this file wins on project
> decisions (stack, data, algorithm, structure). If the scaffold has no `src/` directory, map the layout below to the
> project root accordingly.

Hybrid book recommender for an academic library (Nigerian HND seminar project, YabaTech Computer Science).
It combines **content-based filtering** (TF-IDF + cosine similarity) with **collaborative filtering**
(Pearson user–user similarity). There is a **switching rule** for cold-start patrons and a **weighted
combiner** for everyone else. This is a **prototype**, not production software. It is evaluated offline against two
single-technique baselines.

Full requirements, test cases and open questions: `docs/SPEC.md`. Read it before starting a new cycle.
Record every design decision in `docs/DECISIONS.md`, with the date, the decision and the reason.

## Why this project exists (it shapes every design decision)

The research contribution is the **comparison**. The hybrid must be benchmarked against the content-only and
collaborative-only configurations on the **same dataset, same partition, same preprocessing and same metrics**.
Anything that breaks that comparison breaks the project. So:

- The CBF, CF and hybrid components must stay **separable modules behind a common interface**. Each one must be runnable
  standalone as its own configuration (NFR3).
- The evaluation harness is the most important artefact. Treat it as first-class code with tests.
- Every random operation takes a **seed**, and seeds are recorded.
- The results must be reported honestly, **even if the hybrid does not win**.

## Stack: full Next.js (TypeScript)

- **App:** Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui
- **DB:** PostgreSQL + Prisma (migrations + seed script)
- **Auth:** Auth.js (credentials provider) with bcrypt password hashing (NFR6: never plaintext). Roles: `PATRON`,
  `ADMIN`. Admin routes are protected in middleware.
- **Engine:** plain TypeScript in `src/lib/recommender/`. The maths is hand-written: tokeniser, English stopwords,
  stemming (a small stemmer package is fine), TF-IDF, cosine and Pearson. No heavy ML libraries.
- **Scripts:** run with `tsx` (seed, precompute features, evaluation harness).
- **One-off data prep:** Python + pandas is allowed in `scripts/data/` **only**. It runs offline on the dev machine, writes
  clean CSVs, and is never deployed. Everything that runs at request time or in evaluation is TypeScript.
- **Tests:** Vitest (unit/integration), Playwright (UI smoke + TC15).
- **Deploy:** a single long-running Node server (`next start`, or Docker on a VPS / Railway / Render) + Postgres.
  **Not Vercel serverless for the engine.** Cold starts would rebuild the matrices on every request.

### Pivot rule (in case we move to Next.js + FastAPI later)
Keep `src/lib/recommender/` **framework-free**. It has no Next.js, Prisma or React imports. It takes plain data in and
returns `Map<bookId, score>`. Data loading lives in `src/server/services/`. If we pivot, only the engine and harness are
ported to Python, and the UI and API contract stay the same.

## Project layout

```
src/
  app/                    # routes: (patron) catalogue, book/[id], recommendations; admin/*; api/*
  lib/recommender/        # PURE engine — no framework imports
    types.ts              # Recommender interface, ScoredItem, Explanation
    text.ts               # tokenise, stopwords, stem
    tfidf.ts              # fit/transform, sparse vectors
    content.ts            # ContentRecommender
    collaborative.ts      # CollaborativeRecommender (Pearson)
    normalise.ts          # min-max etc.
    hybrid.ts             # HybridEngine (switching + weighting)
  lib/evaluation/         # split, metrics (P@N, R@N, F1), runner — imports the SAME engine
  server/services/        # Prisma access, cache of fitted models, logging
prisma/                   # schema.prisma, migrations, seed.ts
scripts/
  data/                   # one-off Python data prep (inspect, clean, enrich, sparsify, simulate)
  precompute-features.ts  # fit TF-IDF over catalogue -> book_features
  evaluate.ts             # evaluation harness CLI
data/                     # git-ignored
  raw/                    # goodbooks-10k originals — NEVER modify
  cache/                  # API lookup cache (descriptions.jsonl)
  processed/              # clean CSVs + cleaning_report.md
results/                  # evaluation outputs (JSON/CSV)
docs/                     # SPEC.md, DECISIONS.md
```

## Dataset: goodbooks-10k

The files are in `data/raw/`: `books.csv`, `ratings.csv` (1–5), `book_tags.csv`, `tags.csv`, `to_read.csv` (optional
signal), `sample_book.xml` (ignore).

Known issues, already confirmed by profiling `books.csv`:
- 10,000 books, 23 columns. **No genre column and no description column.**
- `isbn` has **lost its leading zeros** (lengths 7–10). Zero-pad it to 10 characters.
- `isbn13` is **corrupted**: it was stored in scientific notation and the last digit is lost. Ignore it, and derive
  ISBN-13 from ISBN-10 if needed.
- 565 books have no ISBN, so look them up by title + author.
- `language_code` is missing for 1,084 rows. About 150 rows are non-English. Keep `eng`, `en-US`, `en-GB`, `en-CA`.
  Check the missing ones after enrichment.
- 3,332 `image_url`s are "nophoto" placeholders, so the UI needs a fallback cover. Open Library covers are optional.
- 38 books have years below 1000, including negative years. These are ancient works (e.g. *The Iliad*). Keep them.
- Tags are noisy: "to-read", "favorites", "owned", "kindle" and so on are not genres.
- This copy of `ratings.csv` is the **original release**, with about 982k ratings and ~53k users (not the later 6M
  version). After the English filter it's about 20 ratings per user and about 0.23% density, which is already near
  library-like. Step 6 therefore mostly **samples users and caps** them, and only lightly thins.
- The 1,084 books with a null `language_code` are **kept** and re-checked after description enrichment. They are not
  dropped up front.
- The canonical book id is `books.csv` `id` (= `book_id` in ratings/book_tags/to_read). Keep the Goodreads id as
  `goodreads_id`.

### Data pipeline: "Option C" (tags + author + description)

Run each step as a rerunnable script. Ask for approval at each checkpoint marked ⏸.

1. **Inspect:** profile all files, print a summary, and propose cleaning rules. ⏸ Wait for approval.
2. **Fix books:** zero-pad ISBNs, filter to English, de-duplicate.
3. **Genres:** build a **genre whitelist** from `tags.csv`. ⏸ Show it for approval. Then assign each book its top 2–3
   whitelisted tags by count.
4. **Descriptions:** use a **resumable** fetcher. Try Open Library by ISBN, then Google Books by ISBN (an optional
   `GOOGLE_BOOKS_API_KEY`), then a title + author search. Append each result to `data/cache/descriptions.jsonl`,
   rate-limit politely, and skip ids already in the cache. Strip HTML from descriptions. **Run 50 books first and
   report the match rate.** ⏸ Then run the full set.
5. **Build text:** `content_text = genres + author + description`. Keep books that have genres even when the description
   is missing. Drop books that have neither.
6. **Sparsify ratings:** keep only ratings for books that survive. **Keep all users** with at least 3 ratings (no
   sampling down). Cap each user at 30 ratings (random, not top-rated). Then apply the **minimum of 3 ratings per user
   last**. Accept the natural distribution and report it honestly, with no target shape. Use seeded randomness. Report
   the distribution and the sparsity before and after.
7. **Simulate borrows:** add `BORROW` events consistent with each user's genres, keeping the sparsity. Use seeded
   randomness.
8. **Output:** `books_clean.csv`, `interactions_clean.csv` and `cleaning_report.md` (counts before and after each rule,
   match rates, final items / patrons / interactions / sparsity). These numbers go into the students' report.
9. **Seed** Postgres via Prisma, then run `precompute-features.ts`.

## Data model (exactly five core entities)

| Model | Fields |
|---|---|
| `User` | id, name, email (unique), passwordHash, role (`PATRON` \| `ADMIN`), createdAt |
| `Book` | id, title, author, genre (string or string[]), description, publicationYear, isbn, coverUrl, contentText |
| `Interaction` | id, userId, bookId, type (`BORROW` \| `RATE`), ratingValue (Float?, 1–5), timestamp |
| `BookFeature` | id, bookId (unique, 1:1), tfidfVector (Json, sparse `{termIndex: weight}`), generatedAt |
| `RecommendationLog` | id, userId, bookId, sourceComponent (`CONTENT` \| `COLLABORATIVE` \| `HYBRID`), score, servedAt |

- `BookFeature` is kept separate from `Book` on purpose. When an admin updates a book, **regenerate its feature row**
  (TC12). The vocabulary/IDF is refit in `precompute-features.ts`.
- `RecommendationLog` must record **which component produced each served item**. The attribution analysis depends on it.
- `coverUrl`, `isbn` and `contentText` are practical additions to the report's schema. Note them in `DECISIONS.md`.

## Recommendation algorithm (the core rules — do not change silently)

**Score A (content-based).** Run TF-IDF over `contentText`. The patron's preference vector is the rating-weighted
mean of the vectors of books they interacted with. Score A is the cosine similarity between that vector and each
candidate book.

**Score B (collaborative).** Pearson correlation between the target patron and other patrons over co-rated items.
Require a minimum overlap (default 2–3 co-rated books). Take the top-k positive neighbours (default k = 30), then use
the mean-centred prediction:
`pred(u,i) = r̄_u + Σ sim(u,v)·(r_v,i − r̄_v) / Σ|sim(u,v)|`.

**HybridEngine** holds these as named, configurable fields, never inline constants:

```ts
contentWeight = 0.35
collabWeight = 0.65
coldStartThreshold = 3
topN = 10
```

| Condition | Rule |
|---|---|
| patron has `< coldStartThreshold` interactions | **Switch:** content-based only. Do **not** invoke CF (TC07). |
| patron has `>= coldStartThreshold` interactions | **Weight:** `final = contentWeight·A + collabWeight·B`, with **both normalised to a common range first** (FR7) |
| candidate book has no ratings (item cold-start) | B is undefined. Use the rule chosen in `DECISIONS.md` (see SPEC §8, Q6). |

- Read the interaction count **before** invoking either recommender, so the cold-start path skips CF entirely.
- Exclude books the patron has already interacted with from the candidates.
- Write log rows **before** returning the response.
- The weights 0.35/0.65 are **initial values to be tuned in Cycle 4**. Never present them as principled.
- Every recommendation the UI shows must carry a short **"why"** (NFR1). Examples: "Similar to *X* you rated",
  "Readers with similar taste rated this highly".
- Performance: load fitted TF-IDF vectors and the ratings matrix into an in-memory cache at server start, and refresh
  them on change. Do not refit per request.

## Evaluation harness (FR12)

- `pnpm tsx scripts/evaluate.ts --configs content,collab,hybrid --seeds 1,2,3,4,5 --n 10`
- It imports the **same** `src/lib/recommender` code as the app.
- Randomly partition interactions into train and test sets (seeded, e.g. 80/20). Make sure each test patron keeps
  training interactions. Run **all three configurations on the identical partition**. Fit only on train data, which
  includes the interaction counts used by the switching rule.
- Metrics: Precision@N, Recall@N, F1@N averaged over patrons. Report the **mean ± spread over seeds**.
- Also report: component attribution, and **segmented performance** for patrons below and above the cold-start
  threshold.
- Output `results/*.json` and `results/*.csv`, with seeds, N, weights, the relevance threshold and dataset stats.

## Build order (Cycle 0 for data, then the report's five cycles; each one ends working and verified)

| Cycle | Scope | Done when |
|---|---|---|
| **Cycle 0: Data prep** | The data pipeline above, steps 1–8 | Clean CSVs + `cleaning_report.md` exist |
| **Cycle 1: Foundation** | Prisma schema + seed (pipeline step 9), auth, catalogue browse/search (title/author/genre), recording interactions, admin book CRUD (*FR1–3, FR10*) | TC01–TC04, TC12 pass |
| **Cycle 2: Content engine** | TF-IDF + cosine standalone, evaluation harness (*FR4*) | TC05 passes; harness writes **baseline 1** to `results/` |
| **Cycle 3: Collaborative engine** | Pearson standalone (*FR5*) | TC06 passes; **baseline 2** on the same splits |
| **Cycle 4: Hybrid** | Switching, normalisation, weighting, weight sweep (*FR6–8*) | TC07–TC10 pass; sweep results shown before choosing the weights |
| **Cycle 5: App layer** | Recommendations page with explanations, admin stats, logging, final benchmark, UAT checks (*FR9, FR11, FR12, NFR1–6*) | TC11, TC13–TC15 pass; final benchmark in `results/` |

Cycle 0 is an addition to the report's plan. The report folds data preparation into its Cycle 1.

Work **one cycle per session**. Stop at the end of each cycle and summarise what was verified.
Do not start Cycle 4 until both baselines produce metrics from the harness.

## UI & styling

Follow `docs/STYLE.md` for all UI work: colour tokens, typography (Literata + Atkinson Hyperlegible), the **reason slip**
on every recommendation, screen layouts, fallback covers and copy rules. Read it before building any screen.

## UX constraints (from the Technology Acceptance Model)

- **NFR2:** a first-time patron gets a recommendation within **three interactions** of landing (TC15). Keep the patron UI
  simple. For a brand-new patron with zero history, show onboarding (pick a few genres or rate a few popular books)
  that feeds the content path.
- Recommendations are front and centre, never hidden. Each one shows its reason.
- It must work on mobile browsers.

## Out of scope

Physical library automation, real circulation (due dates, fines, copies; "borrow" is only an interaction event), Koha or
any live-system integration, multi-campus deployment, deep learning / neural CF, matrix factorisation (SVD is
discussed in the report but **not** chosen).

## Conventions

- Unit-test text processing, TF-IDF, cosine, Pearson (check against a hand-computed example), normalisation and the
  switching boundary (exactly 2 vs exactly 3 interactions).
- Never commit `data/`. Document the download steps in the README.
- Secrets go in `.env` (`DATABASE_URL`, `AUTH_SECRET`, optional `GOOGLE_BOOKS_API_KEY`), with a `.env.example`
  committed.
- Before a decision the spec leaves open, **ask**, then record the answer in `docs/DECISIONS.md`.
