"""Step 3: assign each book its top 3 whitelisted genres (by raw tag count).

Run after clean_data.py (it edits data/processed/ in place; safe to rerun).
Curation rule: books whose top-3 genres would include erotica are removed from the
catalogue, along with their ratings, to_read and tag rows. Erotica is not on the
whitelist, so remaining books are unaffected by it.
Adds a `genres` column (pipe-separated) to books.csv and records counts in
cleaning_report.json.
"""
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from genre_whitelist import TOP_GENRES, WHITELIST  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "processed"
EXCLUDED_TAGS = {"erotica": ["erotica"]}  # screened for, never assigned


def top_genres(bt, mapping):
    bt = bt[bt.tag_name.isin(mapping)].assign(genre=lambda d: d.tag_name.map(mapping))
    bg = bt.groupby(["book_id", "genre"], as_index=False)["count"].sum()
    # ties broken alphabetically so reruns are deterministic
    bg = bg.sort_values(["book_id", "count", "genre"], ascending=[True, False, True])
    return bg.groupby("book_id").head(TOP_GENRES)


b = pd.read_csv(OUT / "books.csv", dtype={"isbn": "string"})
r, tr, ct = (pd.read_csv(OUT / f) for f in ("ratings.csv", "to_read.csv", "book_tags.csv"))
t = pd.read_csv(RAW / "tags.csv")
raw_bt = pd.read_csv(RAW / "book_tags.csv")
gr2id = dict(zip(b.goodreads_id, b.book_id))
raw_bt = raw_bt[raw_bt.goodreads_book_id.isin(gr2id)].merge(t, on="tag_id")
raw_bt["book_id"] = raw_bt.goodreads_book_id.map(gr2id)

tag2genre = {tag: g for g, tags in WHITELIST.items() for tag in tags}
assert len(tag2genre) == sum(map(len, WHITELIST.values())), "tag in two genres"
screen = {tag: g for g, tags in EXCLUDED_TAGS.items() for tag in tags}
assert not set(screen) & set(tag2genre)

log = json.loads((OUT / "cleaning_report.json").read_text())
log["step3_books_before"] = len(b)

# 1. screen: would erotica be in the book's top 3 (judged with erotica competing)?
screened = top_genres(raw_bt, {**tag2genre, **screen})
drop_ids = set(screened[screened.genre.isin(screen.values())].book_id)
log["step3_books_excluded_erotica"] = len(drop_ids)
log["step3_ratings_dropped_erotica"] = int(r.book_id.isin(drop_ids).sum())
log["step3_to_read_dropped_erotica"] = int(tr.book_id.isin(drop_ids).sum())
log["step3_excluded_erotica_book_ids"] = sorted(int(i) for i in drop_ids)

b = b[~b.book_id.isin(drop_ids)].copy()
r, tr, ct = (d[~d.book_id.isin(drop_ids)] for d in (r, tr, ct))
raw_bt = raw_bt[~raw_bt.book_id.isin(drop_ids)]

# 2. assign
top = top_genres(raw_bt, tag2genre)
b["genres"] = b.book_id.map(top.groupby("book_id").genre.agg("|".join))
n = b.genres.fillna("").map(lambda s: len(s.split("|")) if s else 0)
log["step3_books_after"] = len(b)
log["step3_books_by_genre_count"] = {int(k): int(v) for k, v in n.value_counts().sort_index().items()}
log["step3_ratings_after"] = len(r)
log["step3_users_after"] = int(r.user_id.nunique())
log["step3_to_read_after"] = len(tr)
log["step3_genre_counts"] = (
    b.genres.dropna().str.split("|").explode().value_counts().to_dict()
)
assert r.book_id.isin(set(b.book_id)).all() and tr.book_id.isin(set(b.book_id)).all()

b.to_csv(OUT / "books.csv", index=False)
r.to_csv(OUT / "ratings.csv", index=False)
tr.to_csv(OUT / "to_read.csv", index=False)
ct.to_csv(OUT / "book_tags.csv", index=False)
(OUT / "cleaning_report.json").write_text(json.dumps(log, indent=2))
print(json.dumps({k: v for k, v in log.items() if k.startswith("step3") and k != "step3_excluded_erotica_book_ids"}, indent=2))
