"""Steps 7-8: simulate BORROW events (seed 42), write books_clean.csv, interactions_clean.csv, cleaning_report.md."""
import json
import numpy as np, pandas as pd

SEED = 42
P = "data/processed/"
START, END = pd.Timestamp("2024-09-02"), pd.Timestamp("2025-06-27")  # one academic session
SPAN = (END - START).total_seconds()
PAIR_P = 0.5                                   # share of RATE events preceded by a BORROW
EXTRA_N = np.arange(6)                         # extra (unpaired) borrows per user: 0..5
EXTRA_P = np.array([0.35, 0.25, 0.20, 0.10, 0.06, 0.04])
rng = np.random.default_rng(SEED)

books = pd.read_csv(P + "books_text.csv")
rat = pd.read_csv(P + "ratings_sparse.csv").sort_values(["user_id", "book_id"]).reset_index(drop=True)
pop = rat.groupby("book_id").size()
genres = books.set_index("book_id").genres.fillna("").map(lambda s: s.split("|") if s else [])
bids = books.book_id.to_numpy()
bpop = pop.reindex(bids).fillna(0).to_numpy() + 1.0

def ts(secs): return (START + pd.to_timedelta(secs, unit="s")).dt.strftime("%Y-%m-%dT%H:%M:%SZ")

rows = []
for uid, g in rat.groupby("user_id", sort=True):
    rated = set(g.book_id)
    # RATE events; ~half get a BORROW 3-21 days earlier on the same book
    for b, v in zip(g.book_id, g.rating):
        if rng.random() < PAIR_P:
            t0 = rng.uniform(0, SPAN - 21 * 86400)
            rows.append((uid, b, "BORROW", None, t0, True))
            rows.append((uid, b, "RATE", v, t0 + rng.uniform(3, 21) * 86400, False))
        else:
            rows.append((uid, b, "RATE", v, rng.uniform(0, SPAN), False))
    # extra borrows: unrated books from the user's top-2 genres (rating-weighted), popularity-weighted
    k = rng.choice(EXTRA_N, p=EXTRA_P)
    if k == 0: continue
    score = {}
    for b, v in zip(g.book_id, g.rating):
        for ge in genres[b]: score[ge] = score.get(ge, 0) + v
    top = {ge for ge, _ in sorted(score.items(), key=lambda x: (-x[1], x[0]))[:2]}
    mask = np.array([b not in rated and bool(top & set(genres[b])) for b in bids])
    if mask.sum() < k: mask = np.array([b not in rated for b in bids])  # fallback: any unrated book
    cand, w = bids[mask], bpop[mask]
    pick = rng.choice(cand, size=min(k, len(cand)), replace=False, p=w / w.sum())
    for b in pick: rows.append((uid, int(b), "BORROW", None, rng.uniform(0, SPAN), True))

inter = pd.DataFrame(rows, columns=["user_id", "book_id", "type", "rating_value", "t", "simulated"])
inter["timestamp"] = ts(inter.t)
inter = inter.sort_values(["user_id", "t"]).drop(columns="t").reset_index(drop=True)
# sanity: each paired borrow precedes its rating; ratings untouched
chk = inter.pivot_table(index=["user_id", "book_id"], columns="type", values="timestamp", aggfunc="min").dropna()
assert (chk.BORROW < chk.RATE).all()
assert len(inter[inter.type == "RATE"]) == len(rat)
inter.insert(0, "id", range(1, len(inter) + 1))
inter[["user_id", "book_id", "type", "rating_value", "timestamp", "simulated"]].to_csv(P + "interactions_clean.csv", index=False)

# ---- books_clean.csv
bc = pd.DataFrame(dict(
    book_id=books.book_id, title=books.title_clean, author=books.first_author,
    genres=books.genres, description=books.description.fillna(""),
    publication_year=books.original_publication_year.astype("Int64"),
    isbn=books.isbn.astype("string").str.zfill(10),
    cover_url=books.image_url.where(~books.image_url.fillna("nophoto").str.contains("nophoto"), ""),
    content_text=books.content_text))
bc.loc[books.isbn.isna(), "isbn"] = ""
bc.to_csv(P + "books_clean.csv", index=False)

# ---- statistics for the report
R, B = inter[inter.type == "RATE"], inter[inter.type == "BORROW"]
users = inter.user_id.nunique(); nb = len(bc)
pr = R.groupby("user_id").size(); pi = inter.groupby("user_id").size()
def bands(s, edges):
    return {f"{a}-{b}": int(s.between(a, b).sum()) for a, b in edges}
uniq_pairs = len(inter.drop_duplicates(["user_id", "book_id"]))
paired = int(len(chk)); extra = len(B) - paired
stats = dict(users=users, books=nb, interactions=len(inter), rate=len(R), borrow=len(B), paired_borrows=paired,
             extra_borrows=int(extra), unique_pairs=uniq_pairs,
             density_ratings_pct=round(100 * len(R) / (users * nb), 3),
             density_all_pct=round(100 * uniq_pairs / (users * nb), 3))
json.dump(stats, open(P + "step7_report.json", "w"), indent=1)

# ---- cleaning_report.md
cr = json.load(open(P + "cleaning_report.json"))
desc = {}
for l in open("data/cache/descriptions.jsonl"):
    r = json.loads(l); desc[r["book_id"]] = r
cat = [desc.get(i, {}) for i in books.book_id]
via = pd.Series([c.get("matched_via") or "none" for c in cat]).value_counts()
src = pd.Series([c.get("source") or "none" for c in cat]).value_counts()
raw_users = pd.read_csv("data/raw/ratings.csv", usecols=["user_id"]).user_id.nunique()
s5, s6 = json.load(open(P + "step5_report.json")), json.load(open(P + "step6_report.json"))
gcount = pd.Series([g for gl in genres for g in gl]).value_counts()
rv = R.rating_value.astype(int).value_counts().sort_index()
ext = B.groupby("user_id").size()
# extra borrows per user = borrows minus paired ones
pairs_per_user = chk.reset_index().groupby("user_id").size()
extra_pu = (B.groupby("user_id").size().reindex(pr.index).fillna(0) - pairs_per_user.reindex(pr.index).fillna(0)).astype(int)
extra_dist = extra_pu.value_counts().sort_index()
cold_r = int((pr < 3).sum()); cold_i = int((pi < 3).sum())
T = lambda d: "\n".join(f"| {k} | {v:,} |" for k, v in d.items())
md = f"""# Cleaning report: LibRec dataset (Cycle 0)

Source: goodbooks-10k, original release (`data/raw/`, never modified). All random steps use seed **{SEED}**.
Generated by `scripts/data/*.py`; numbers below come from the `data/processed/*_report.json` files and the final CSVs.

## Pipeline summary

| Step | Rule | Before | After |
|---|---|---|---|
| 1-2 | Filter language to eng / en-US / en-GB / en-CA (1,084 null-language kept, re-checked later) | {cr['books_raw']:,} books | {cr['books_after_language_filter']:,} |
| 2 | De-duplicate books (title + first author; 1 pair merged) | {cr['books_after_language_filter']:,} | {cr['books_final']:,} |
| 2 | Ratings: keep rows of surviving books, drop duplicate (user, book) | {cr['ratings_raw']:,} ratings ({raw_users:,} users) | {cr['ratings_after_dedupe']:,} ratings ({cr['users_final']:,} users) |
| 3 | Genre whitelist (44 genres); exclude books with `erotica` in top-3 | {cr['step3_books_before']:,} books | {cr['step3_books_after']:,} books / {cr['step3_ratings_after']:,} ratings |
| 3b | Catalogue limited to 1,000 books (>=10 per primary genre, then most-rated) | {cr['step3_books_after']:,} | 1,000 books / {s6['before_cap']['ratings']:,} ratings / {s6['before_cap']['users']:,} users |
| 5 | Build `content_text`; non-English description discarded (1); none dropped | 1,000 | {s5['books_out']:,} |
| 6 | Cap 30 ratings per user (random), then min 3 per user | {s6['before_cap']['users']:,} users / {s6['before_cap']['ratings']:,} ratings | {s6['final']['users']:,} users / {s6['final']['ratings']:,} ratings |
| 7 | Simulate BORROW events | {len(R):,} ratings | {len(inter):,} interactions |

Other cleaning facts: ISBN-10 zero-padded to 10 characters; `isbn13` ignored (corrupted); {cr['step3_books_excluded_erotica']} books excluded under the erotica rule
(with {cr['step3_ratings_dropped_erotica']:,} ratings); {cr['books_without_isbn']} books originally had no ISBN.

## Genres

Each book has its top 3 whitelisted genres by raw tag count. Books with 3 genres in the 1,000-book catalogue: {int(books.genres.fillna('').str.count('[|]').eq(2).sum()):,}.
Most common genres in the catalogue:

| Genre | Books |
|---|---|
{T(gcount.head(10))}

## Descriptions (Open Library, then Google Books)

Match rate over the 1,000 catalogue books: **{s5['with_description']:,} with a description ({s5['with_description'] / 10:.1f}%)**, {s5['without_description']} without (36 found nothing; 1 had its French blurb discarded).

| Matched by | Books |
|---|---|
{T(via)}

| Source | Books |
|---|---|
{T(src)}

HTML, markdown, boilerplate and repeated sentences were removed (14 descriptions shortened by more than 10%).
One non-English (French) blurb from a wrong-edition match was discarded (*Watchers*); the book was kept.
Null-language books: 46 re-checked; 6 have no description and stay unverified; none dropped.
Mean `content_text` length: **{s5['avg_content_text_chars']:.0f} characters (~{s5['avg_content_text_words']:.0f} words)**. Books without description keep genres + author only.

## Ratings after step 6 (real data, `simulated = false`)

- Users **{s6['final']['users']:,}**, books **{nb:,}**, ratings **{len(R):,}**, density **{s6['final']['density_pct']}%** (ratings / (users x books))
- Ratings per user: mean {s6['final']['mean_per_user']}, median {s6['final']['median_per_user']:.0f}

| Ratings per user | Users | Share |
|---|---|---|
| 3-4 | {s6['final']['bands']['3-4']:,} | {100*s6['final']['bands']['3-4']/users:.1f}% |
| 5-15 | {s6['final']['bands']['5-15']:,} | {100*s6['final']['bands']['5-15']/users:.1f}% |
| 16-30 | {s6['final']['bands']['16-30']:,} | {100*s6['final']['bands']['16-30']/users:.1f}% |

Rating values (1-5):

| Value | Ratings | Share |
|---|---|---|
""" + "\n".join(f"| {k} | {v:,} | {100*v/len(R):.1f}% |" for k, v in rv.items()) + f"""

6,918 of 11,767 users (59%) were dropped for having fewer than 3 ratings on the 1,000-book catalogue.

## Simulated borrows (step 7, `simulated = true`)

Rules (also in `docs/DECISIONS.md`):

1. **Paired borrows:** each real rating is preceded, with probability 0.5, by a BORROW of the same book 3-21 days earlier.
2. **Extra borrows:** each user gets 0-5 further BORROWs (probabilities 0.35 / 0.25 / 0.20 / 0.10 / 0.06 / 0.04 for 0..5), on books they have **not** rated.
   Books come from the user's top 2 genres (genre score = sum of the user's ratings), sampled without replacement, weighted by popularity (rating count + 1).
3. **Timestamps:** goodbooks has none, so all are generated uniformly within one academic session ({START.date()} to {END.date()}); each paired borrow precedes its rating.
4. Real ratings are never altered. `simulated` distinguishes the two kinds of row.

| Result | Count |
|---|---|
| Paired borrows | {paired:,} |
| Extra borrows | {extra:,} |
| Total BORROW events | {len(B):,} |
| Total interactions (RATE + BORROW) | {len(inter):,} |

Extra borrows per user:

| Extra borrows | Users |
|---|---|
{T(extra_dist)}

## Final dataset

- Files: `books_clean.csv` ({nb:,} books), `interactions_clean.csv` ({len(inter):,} rows)
- Users **{users:,}**; books **{nb:,}**; unique (user, book) pairs **{uniq_pairs:,}**
- Sparsity: **{100 - stats['density_all_pct']:.2f}%** of the user-book matrix is empty (density {stats['density_all_pct']}% counting all interactions; {stats['density_ratings_pct']}% counting ratings only)
- Interactions per user (RATE + BORROW): mean {pi.mean():.1f}, median {pi.median():.0f}, min {pi.min()}, max {pi.max()}

| Interactions per user | Users |
|---|---|
| 3-4 | {int(pi.between(3,4).sum()):,} |
| 5-15 | {int(pi.between(5,15).sum()):,} |
| 16-30 | {int(pi.between(16,30).sum()):,} |
| 31+ | {int((pi>30).sum()):,} |

Users with fewer than 3 interactions in the full data: {cold_i}. The cold-start segment in evaluation arises after the train/test split
(users with fewer than 3 training interactions), see `docs/DECISIONS.md`.

## Caveats for the report

- Borrows are simulated: they are consistent with each user's tastes by construction, so they favour content-based methods and should be reported as such.
- Timestamps are synthetic; do not use them for temporal analysis.
- Ratings skew positive (about 64% are 4 or 5).
- Whether borrows count towards the cold-start threshold is Open Question 2 in `docs/DECISIONS.md` (suggested: any interaction).
"""
open(P + "cleaning_report.md", "w").write(md)
print(md)
