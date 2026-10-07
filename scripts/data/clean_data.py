"""Clean data/raw/ (Goodbooks-10k) into data/processed/.

Step 2 (fix books) plus the English filter. Rules: zero-pad isbn to 10, drop the
corrupted isbn13, de-duplicate books, keep English books and books with a null
language_code (flagged for re-check after description enrichment). Ratings: last-wins
dedupe of (user_id, book_id). The min-ratings-per-user rule belongs at the end of
step 6 (sparsify), not here.
Canonical book_id = raw books.id (what ratings/to_read use); raw books.book_id
(the Goodreads id, used by book_tags) is kept as goodreads_id.
"""
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "processed"
TOP_K_TAGS = 15
ENGLISH = {"eng", "en-US", "en-GB", "en-CA"}

SHELF_TAGS = {
    "to-read", "currently-reading", "favorites", "favourites", "books-i-own", "owned",
    "owned-books", "my-books", "kindle", "default", "library", "to-buy", "book-club",
    "i-own", "ebook", "ebooks", "audiobook", "audiobooks", "audible", "wish-list",
    "wishlist", "my-library", "read", "to-read-nonfiction", "e-book", "own", "favorite",
    "re-read", "dnf", "abandoned", "unfinished", "finished", "owned-ebooks",
}
TAG_MERGE = {
    "sci-fi": "science-fiction", "scifi": "science-fiction", "sf": "science-fiction",
    "ya": "young-adult", "nonfiction": "non-fiction", "non-fiction": "non-fiction",
    "ya-fantasy": "young-adult-fantasy", "historical": "historical-fiction",
    "chick-lit": "chick-lit", "childrens": "children", "children-s": "children",
    "kids": "children", "bio": "biography", "biographies": "biography",
}

log = {}

# ---- books -----------------------------------------------------------------
b = pd.read_csv(RAW / "books.csv", dtype={"isbn": "string"})
log["books_raw"] = len(b)
log["books_null_language"] = int(b.language_code.isna().sum())
keep_lang = b.language_code.isin(ENGLISH) | b.language_code.isna()
log["books_dropped_non_english"] = int((~keep_lang).sum())
b = b[keep_lang].copy()
log["books_after_language_filter"] = len(b)
# null-language books stay, flagged; re-check after description enrichment
b["language_unverified"] = b.language_code.isna()
b["language_code"] = b.language_code.where(b.language_code.isna(), "eng")

b = b.rename(columns={"book_id": "goodreads_id", "id": "book_id"})
b["original_publication_year"] = b.original_publication_year.astype("Int64")
b["pub_year_suspect"] = b.original_publication_year < 1000
# isbn lost its leading zeros; isbn13 is corrupted (sci-notation) so it is dropped
b["isbn"] = b.isbn.str.strip().str.zfill(10)
log["books_without_isbn"] = int(b.isbn.isna().sum())
b = b.drop(columns=["isbn13"])

series_re = re.compile(r"\s*\(([^()]*?)#(\d+[^()]*)\)\s*$")
m = b.title.str.extract(series_re)
b["series"] = m[0].str.strip(" ,").replace("", pd.NA)
b["title_clean"] = b.title.str.replace(series_re, "", regex=True).str.strip()
b["original_title"] = b.original_title.fillna(b.title_clean)
b["authors_list"] = b.authors.str.split(r"\s*,\s*")
b["first_author"] = b.authors_list.str[0]
b["authors_list"] = b.authors_list.map(json.dumps)
b["image_url"] = b.image_url.where(~b.image_url.str.contains("nophoto", na=False))
b = b.drop(columns=["best_book_id", "small_image_url"])

# de-duplicate books: same full title (series suffix included) + first author -> keep the most-rated copy
dkey = b.title.str.lower().str.replace(r"\s+", " ", regex=True).str.strip() + "|" + b.first_author.str.lower().str.strip()
b = b.assign(_k=dkey).sort_values("ratings_count", ascending=False)
dup_map = dict(zip(b.book_id, b.groupby("_k").book_id.transform("first")))
b = b.drop_duplicates("_k").drop(columns="_k").sort_values("book_id")
dropped = {k: v for k, v in dup_map.items() if k != v}
log["books_duplicates_removed"] = len(dropped)
log["books_duplicate_pairs"] = {int(k): int(v) for k, v in dropped.items()}
log["books_final"] = len(b)
keep_ids = set(b.book_id)
gr2id = dict(zip(b.goodreads_id, b.book_id))
# goodreads ids of removed duplicates also map to the kept book (so tags merge)
id2gr = dict(zip(pd.read_csv(RAW / "books.csv").id, pd.read_csv(RAW / "books.csv").book_id))
for old, new in dropped.items():
    gr2id[id2gr[old]] = new

# ---- ratings ---------------------------------------------------------------
r = pd.read_csv(RAW / "ratings.csv")
log["ratings_raw"] = len(r)
r["book_id"] = r.book_id.map(lambda x: dup_map.get(x, x))
r = r[r.book_id.isin(keep_ids)]
log["ratings_after_book_filter"] = len(r)
r = r.drop_duplicates(["user_id", "book_id"], keep="last")
log["ratings_after_dedupe"] = len(r)
log["ratings_final"] = len(r)
log["users_final"] = r.user_id.nunique()
log["books_with_no_ratings"] = len(keep_ids - set(r.book_id))

# ---- tags ------------------------------------------------------------------
t = pd.read_csv(RAW / "tags.csv")
bt = pd.read_csv(RAW / "book_tags.csv")
log["book_tags_raw"] = len(bt)
bt = bt[bt["count"] > 0]
bt = bt[bt.goodreads_book_id.isin(gr2id)]
t = t[t.tag_name.str.match(r"^[a-zA-Z]") & ~t.tag_name.isin(SHELF_TAGS)].copy()
t["tag_name"] = t.tag_name.replace(TAG_MERGE)
t = t[~t.tag_name.isin(SHELF_TAGS)]
bt = bt.merge(t, on="tag_id")
bt["book_id"] = bt.goodreads_book_id.map(gr2id)
bt = bt.groupby(["book_id", "tag_name"], as_index=False)["count"].sum()
bt = bt.sort_values(["book_id", "count"], ascending=[True, False]).groupby("book_id").head(TOP_K_TAGS)
log["book_tags_final"] = len(bt)
log["distinct_tags_final"] = bt.tag_name.nunique()
log["books_with_no_tags"] = len(keep_ids - set(bt.book_id))

# ---- to_read (kept as weak signal, not used in first pass) -----------------
tr = pd.read_csv(RAW / "to_read.csv")
tr["book_id"] = tr.book_id.map(lambda x: dup_map.get(x, x))
tr = tr[tr.book_id.isin(keep_ids)].drop_duplicates(["user_id", "book_id"])
log["to_read_final"] = len(tr)

# ---- integrity + write -----------------------------------------------------
assert r.book_id.isin(keep_ids).all() and bt.book_id.isin(keep_ids).all()
assert not r.duplicated(["user_id", "book_id"]).any()
assert r.rating.between(1, 5).all()
OUT.mkdir(parents=True, exist_ok=True)
b.to_csv(OUT / "books.csv", index=False)
r.to_csv(OUT / "ratings.csv", index=False)
bt.to_csv(OUT / "book_tags.csv", index=False)
tr.to_csv(OUT / "to_read.csv", index=False)
(OUT / "cleaning_report.json").write_text(json.dumps(log, indent=2))
print(json.dumps(log, indent=2))
