# LibRec

A hybrid book recommender for an academic library: **content-based filtering** (TF-IDF + cosine similarity) combined
with **collaborative filtering** (Pearson user–user similarity), with a switching rule for patrons who are new to the
library. It was built for a Yaba College of Technology HND Computer Science seminar project and is evaluated offline
against two single-technique baselines.

This is a prototype, not production software. The research question is the comparison: does the hybrid beat the
content-only and collaborative-only configurations on the same data, partition and metrics? The answer, honestly
reported, is in [results/RESULTS.md](results/RESULTS.md).

| Where | What |
|---|---|
| `app/`, `components/`, `server/` | The Next.js app: catalogue, book pages, Your shelf, onboarding, admin |
| `lib/recommender/` | The engine (plain TypeScript, no framework imports): tokeniser, TF-IDF, content, collaborative, hybrid |
| `lib/evaluation/` | The evaluation harness (split, metrics, runner, significance tests); imports the same engine as the app |
| `scripts/` | `evaluate.ts`, `significance.ts`, `make-results.ts`, `precompute-features.ts`, and `data/` (one-off Python data prep) |
| `prisma/` | Schema, migrations, seed, demo reset |
| `docs/` | `SPEC.md` (requirements and test cases), `DECISIONS.md` (every design decision), `STYLE.md`, `UAT.md` |
| `results/` | Evaluation output, `RESULTS.md` and charts |

## Setup

You need Node 20 or later, npm, Docker (for the local database), and Python 3 with pandas (only for the one-off data
preparation, not needed to run the app).

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET (openssl rand -base64 32), ADMIN_EMAIL and ADMIN_PASSWORD
npm run db:up                 # local Postgres from docker-compose.yml, on port 5443
npx prisma migrate deploy     # create the tables
npm run db:seed               # load books, patrons and interactions from data/processed (needs the data, see below)
npm run db:features           # fit TF-IDF over the catalogue and store each book's vector
npm run dev                   # http://localhost:3000
```

### The database: local for development and tests, hosted for deployment

Everything runs against a **local Postgres in Docker** (`docker-compose.yml`: Postgres 15, port 5443, user, password
and database all `librec`). `.env.example` points `DATABASE_URL` at it. Port 5443 avoids clashing with a Postgres
already installed on 5432 or 5433.

- **Tests never touch `DATABASE_URL`.** Vitest uses the schema `librec_test` and Playwright uses `librec_test_e2e` in the
  local database, so a test run cannot wipe your development data or a hosted database. Set `TEST_DATABASE_URL` or
  `E2E_DATABASE_URL` to use a different database (the schema name must contain "test", or the run is refused).
- **Supabase (or any hosted Postgres) is for deployment only.** Set `DATABASE_URL` to the hosted URL in the deployment
  environment. A new hosted database needs `npx prisma migrate deploy`, the seed and `npm run db:features` once; the
  project's Supabase database was already initialised and loaded, so those steps are not repeated for it.
  **Never run `npm run db:seed -- --reset` against a hosted database:** it truncates every table.
- `npm run db:down` stops the container; the data stays in the Docker volume. `docker compose down -v` deletes it.

If you moved from the earlier setup that used the hosted Supabase database for development: nothing in the code changed
except the defaults, so either keep your Supabase `DATABASE_URL` for `npm run dev` (tests will still use the local
database), or switch it to the local URL and run the four setup commands above.

### Data

The data is not in the repository (`data/` is git-ignored).

1. Download [goodbooks-10k](https://github.com/zygmuntz/goodbooks-10k) and put `books.csv`, `ratings.csv`,
   `book_tags.csv`, `tags.csv` and `to_read.csv` in `data/raw/`. Never modify these files.
2. Run the data pipeline (below) to produce `data/processed/books_clean.csv`, `interactions_clean.csv` and
   `cleaning_report.md`. The seed and the evaluation read those two CSVs.

## Data pipeline

Cycle 0 of the build. Each step is a rerunnable script in `scripts/data/` (Python + pandas, offline, never deployed).
Random steps use seed 42. The choices behind each step are in `docs/DECISIONS.md`, and the numbers they produce in
`data/processed/cleaning_report.md`.

```bash
python3 scripts/data/clean_data.py                 # 1-2: zero-pad ISBNs, keep English, de-duplicate
python3 scripts/data/genre_whitelist.py            # 3: propose the genre whitelist (review it before continuing)
python3 scripts/data/assign_genres.py              # 3: each book gets its top 3 whitelisted genres
python3 scripts/data/select_catalogue.py           # 3b: limit the catalogue to 1,000 books
python3 scripts/data/fetch_descriptions.py --limit 50 --seed 1   # 4: trial run, check the match rate
python3 scripts/data/fetch_descriptions.py         # 4: full run (resumable; cache in data/cache/)
python3 scripts/data/build_text.py                 # 5: content_text = genres + author + description
python3 scripts/data/sparsify_ratings.py           # 6: cap 30 ratings per user, keep users with at least 3
python3 scripts/data/finalise.py                   # 7-8: simulate borrows, write the clean CSVs and the report
```

`GOOGLE_BOOKS_API_KEY` in `.env` is optional and only used by the description fetcher.

## Demo accounts

`npm run db:seed` creates these (development only; the password is `demo1234`):

| Account | History | What to look at |
|---|---|---|
| `cold@librec.demo` | 2 books (one borrowed, one rated) | The cold-start path: content-based picks with "Because you rated …" and "Similar to … you borrowed" |
| `heavy@librec.demo` | 28 ratings of popular fantasy and young-adult books | The hybrid path |
| the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` | | Admin: book management and `/admin/statistics` |

A brand-new account (Create account) starts on **Start your shelf**: pick subjects or rate a few popular books, then see
Your shelf. The patrons in the dataset are `user<id>@librec.test` and cannot log in.

### Resetting the demo accounts

Trying the app changes the demo accounts (a borrow or rating adds to their history, and every shelf served is logged).

```bash
npm run db:reset-demo
```

restores both demo accounts to exactly what the seed created (history, name, password) and deletes **all** of their
recommendation-log rows. Nothing else is touched. **Restart the app afterwards**: it keeps the ratings index in memory
and does not see the reset until it restarts.

## Running the evaluation

The evaluation reads `data/processed/*.csv` directly (no database, no app), excludes the admin and demo accounts, and
is deterministic for a given seed. All configurations run on the identical partition.

```bash
# The three configurations plus the sanity baseline, five seeds, N = 10.
# hybrid-tuned first sweeps contentWeight on a validation split cut from the TRAINING data, then tests the chosen weight once.
npx tsx scripts/evaluate.ts --configs content,collab,hybrid,hybrid-tuned,popular --seeds 1,2,3,4,5 --n 10 --out results/eval-final

# Paired significance tests (Wilcoxon per seed, paired t-test across seeds) -> results/significance.json and .csv
npx tsx scripts/significance.ts

# Rebuild results/RESULTS.md and results/charts/*.png from the result files
npx tsx scripts/make-results.ts
```

Output goes to `results/*.json` and `results/*.csv` with the seeds, N, weights, relevance rule and dataset statistics.
`--configs content` or `--configs collab` runs a single configuration on its own (the baselines).

## Tests

```bash
npm run db:up        # once: the tests need the local database
npm test             # Vitest: unit and integration tests (about 4 seconds)
npm run test:e2e     # Playwright: first-recommendation (TC15) and UI checks, desktop and a 360 px phone
npm run lint
```

`npm run test:e2e` starts its own `next dev` on port 3100 with its own build directory, so it can run next to
`npm run dev`. The first run needs the browser: `npx playwright install chromium`.

The test cases are listed in `docs/SPEC.md` (TC01–TC15). `docs/UAT.md` is the script for the user acceptance test with
real students (NFR1 and NFR2).

## Recommendation rules (summary)

- **Content score A:** TF-IDF over each book's genres, author and description; a patron's profile is the
  rating-weighted mean of the vectors of the books they have; A is the cosine similarity to each candidate.
- **Collaborative score B:** Pearson correlation over co-rated books (at least 3), the 30 most similar positive
  neighbours, and the mean-centred prediction of the patron's rating.
- **Switching:** a patron with fewer than 3 distinct books gets content-based results only, and collaborative filtering
  is not called. From 3 books on, `final = contentWeight · A + collabWeight · B`, both scaled to [0, 1] first.
- **Weights:** `contentWeight` 0.8 and `collabWeight` 0.2, chosen on a validation split (the initial 0.35 / 0.65 were
  worse than content alone; both are reported). They live in `lib/recommender/hybrid.ts`, not inline.
- Every recommendation shown carries its reason, and every served recommendation is logged with the component that
  produced it.

See `docs/DECISIONS.md` for every design decision with its date and reason.

## Deployment

A single long-running Node server plus Postgres (`next build`, `next start`, or Docker on a VPS, Railway or Render),
**not** Vercel serverless: the engine keeps the fitted matrices in memory, and a cold start would rebuild them on every
request. Run one server instance (the in-memory cache is per process). Use a hosted Postgres (for example Supabase) for
`DATABASE_URL`.
