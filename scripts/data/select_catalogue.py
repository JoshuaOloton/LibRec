"""Step 3b: limit the catalogue to TARGET books before fetching descriptions.

Run after assign_genres.py (edits data/processed/ in place). Rules:
  1. Per primary genre (first entry of `genres`), keep the MIN_PER_GENRE most-rated
     books, or all of them if fewer exist.
  2. Fill the remaining slots with the most-rated books overall.
  3. Drop ratings, to_read and book_tags rows of books not selected.
"most rated" = number of rating rows in ratings.csv (ties broken by book_id).
Records counts in cleaning_report.json under step3b_*.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "processed"
TARGET = 1000
MIN_PER_GENRE = 10

b = pd.read_csv(OUT / "books.csv", dtype={"isbn": "string"})
r, tr, ct = (pd.read_csv(OUT / f) for f in ("ratings.csv", "to_read.csv", "book_tags.csv"))
log = json.loads((OUT / "cleaning_report.json").read_text())

b["n_ratings"] = b.book_id.map(r.groupby("book_id").size()).fillna(0).astype(int)
b["primary_genre"] = b.genres.str.split("|").str[0]
ranked = b.sort_values(["n_ratings", "book_id"], ascending=[False, True])

guaranteed = ranked.groupby("primary_genre").head(MIN_PER_GENRE)
assert len(guaranteed) <= TARGET
rest = ranked[~ranked.book_id.isin(guaranteed.book_id)].head(TARGET - len(guaranteed))
sel = pd.concat([guaranteed, rest])
ids = set(sel.book_id)

r2, tr2, ct2 = (d[d.book_id.isin(ids)] for d in (r, tr, ct))
per_user = r2.groupby("user_id").size()
n_users, n_books_all = r.user_id.nunique(), len(b)
log.update({
    "step3b_target": TARGET,
    "step3b_min_per_genre": MIN_PER_GENRE,
    "step3b_books_before": len(b),
    "step3b_books_guaranteed": len(guaranteed),
    "step3b_books_filled": len(rest),
    "step3b_books_after": len(sel),
    "step3b_primary_genre_counts": sel.primary_genre.value_counts().to_dict(),
    "step3b_primary_genre_available": b.primary_genre.value_counts().to_dict(),
    "step3b_ratings_before": len(r),
    "step3b_ratings_after": len(r2),
    "step3b_share_of_step3_ratings": round(len(r2) / len(r), 4),
    "step3b_share_of_original_ratings": round(len(r2) / log["ratings_raw"], 4),
    "step3b_users_before": n_users,
    "step3b_users_after": int(r2.user_id.nunique()),
    "step3b_users_with_ge3_ratings": int((per_user >= 3).sum()),
    "step3b_ratings_per_user_median": float(per_user.median()),
    "step3b_ratings_per_user_mean": round(float(per_user.mean()), 2),
    "step3b_density": round(len(r2) / (len(sel) * r2.user_id.nunique()), 5),
    "step3b_ratings_per_book_min": int(r2.groupby("book_id").size().min()),
    "step3b_ratings_per_book_median": float(r2.groupby("book_id").size().median()),
    "step3b_to_read_after": len(tr2),
    "step3b_tags_rows_after": len(ct2),
})
sel.drop(columns=["n_ratings", "primary_genre"]).sort_values("book_id").to_csv(OUT / "books.csv", index=False)
r2.to_csv(OUT / "ratings.csv", index=False)
tr2.to_csv(OUT / "to_read.csv", index=False)
ct2.to_csv(OUT / "book_tags.csv", index=False)
(OUT / "cleaning_report.json").write_text(json.dumps(log, indent=2))

cached = [json.loads(l) for l in (ROOT / "data/cache/descriptions.jsonl").read_text().splitlines() if l.strip()] \
    if (ROOT / "data/cache/descriptions.jsonl").exists() else []
hits = {c["book_id"] for c in cached if c["description"]}
print(json.dumps({k: v for k, v in log.items() if k.startswith("step3b") and "genre" not in k}, indent=2))
g = pd.DataFrame({"selected": log["step3b_primary_genre_counts"], "available": log["step3b_primary_genre_available"]}).fillna(0).astype(int)
print(g.sort_values("selected", ascending=False).to_string())
print(f"cached descriptions: {len(cached)} books ({len(hits)} with text); {len({c['book_id'] for c in cached} & ids)} of them in the selection")
