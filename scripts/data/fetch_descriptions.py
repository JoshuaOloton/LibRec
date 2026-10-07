"""Step 4: resumable book-description fetcher.

Per book, tries in order: Open Library by ISBN -> Google Books by ISBN ->
title + author search (Open Library, then Google Books). Every outcome (hit or
miss) is appended to data/cache/descriptions.jsonl, and book ids already in the
cache are skipped on rerun. Transient errors (429/5xx/timeouts) are NOT cached,
so they are retried next run.

  python3 scripts/data/fetch_descriptions.py --limit 50 --seed 1   # trial
  python3 scripts/data/fetch_descriptions.py                       # full run
"""
import argparse
import html
import json
import os
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
BOOKS = ROOT / "data" / "processed" / "books.csv"
CACHE = ROOT / "data" / "cache" / "descriptions.jsonl"
MIN_LEN = 50  # shorter than this is not a usable description
DELAY = 0.5   # seconds between requests
OL, GB = "https://openlibrary.org", "https://www.googleapis.com/books/v1/volumes"

sess = requests.Session()
sess.headers["User-Agent"] = "LibRec-seminar-project/0.1 (academic prototype)"


def load_key():
    key = os.environ.get("GOOGLE_BOOKS_API_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GOOGLE_BOOKS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
    return key or None


KEY = load_key()


class Transient(Exception):
    pass


def get(url, **params):
    time.sleep(DELAY)
    try:
        resp = sess.get(url, params=params, timeout=20)
    except requests.RequestException as e:
        raise Transient(type(e).__name__)
    if resp.status_code == 404:
        return None
    if resp.status_code == 429 or resp.status_code >= 500:
        raise Transient(f"HTTP {resp.status_code}")
    if resp.status_code != 200:
        return None
    try:
        return resp.json()
    except ValueError:
        return None


def clean(text):
    if isinstance(text, dict):
        text = text.get("value")
    if not isinstance(text, str):
        return None
    text = re.sub(r"<br\s*/?>|</p>", " ", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"\(\s*https?://[^)]*\)|\[\s*\d+\s*\]\s*:\s*https?://\S+", " ", text)  # OL markdown links
    text = re.sub(r"\s*-{3,}.*$", "", text, flags=re.S)  # OL appends "----- Contains: ..." blocks
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) >= MIN_LEN else None


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def title_ok(found, wanted):
    a, b = norm(found or ""), norm(wanted)
    return bool(a) and (a in b or b in a)


def ol_work_description(key):
    work = get(f"{OL}{key}.json")
    return clean(work.get("description")) if work else None


def ol_isbn(isbn):
    ed = get(f"{OL}/isbn/{isbn}.json")
    if not ed:
        return None
    d = clean(ed.get("description"))
    if d:
        return d
    for w in ed.get("works", []):
        d = ol_work_description(w["key"])
        if d:
            return d
    return None


def gb_search(q):
    params = {"q": q, "maxResults": 3, "printType": "books"}
    if KEY:
        params["key"] = KEY
    return (get(GB, **params) or {}).get("items", [])


def gb_isbn(isbn):
    for it in gb_search(f"isbn:{isbn}"):
        d = clean(it["volumeInfo"].get("description"))
        if d:
            return d
    return None


def ol_title_author(title, author):
    res = get(f"{OL}/search.json", title=title, author=author, limit=3, fields="key,title")
    for doc in (res or {}).get("docs", []):
        if title_ok(doc.get("title"), title):
            d = ol_work_description(doc["key"])
            if d:
                return d
    return None


def gb_title_author(title, author):
    for it in gb_search(f'intitle:"{title}" inauthor:"{author}"'):
        vi = it["volumeInfo"]
        d = clean(vi.get("description"))
        if d and title_ok(vi.get("title"), title):
            return d
    return None


def fetch(row):
    """Return (description, source, matched_via) or (None, None, None)."""
    isbn = None if pd.isna(row.isbn) else row.isbn
    steps = []
    if isbn:
        steps += [("openlibrary", "isbn", lambda: ol_isbn(isbn)), ("googlebooks", "isbn", lambda: gb_isbn(isbn))]
    steps += [
        ("openlibrary", "title_author", lambda: ol_title_author(row.title_clean, row.first_author)),
        ("googlebooks", "title_author", lambda: gb_title_author(row.title_clean, row.first_author)),
    ]
    for source, via, fn in steps:
        d = fn()
        if d:
            return d, source, via
    return None, None, None


def read_cache():
    if not CACHE.exists():
        return {}
    return {json.loads(l)["book_id"]: json.loads(l) for l in CACHE.read_text().splitlines() if l.strip()}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="trial: seeded random sample of N books")
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    books = pd.read_csv(BOOKS, dtype={"isbn": "string"})
    if args.limit:
        books = books.sample(args.limit, random_state=args.seed)  # random, so the rate is representative
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    done = read_cache()
    todo = [r for r in books.itertuples() if r.book_id not in done]
    print(f"{len(books)} selected, {len(books) - len(todo)} already cached, {len(todo)} to fetch "
          f"(google key: {'yes' if KEY else 'no'})")

    errors = 0
    with CACHE.open("a") as f:
        for i, row in enumerate(todo, 1):
            try:
                d, source, via = fetch(row)
            except Transient as e:
                errors += 1
                print(f"  [{i}/{len(todo)}] book {row.book_id}: transient {e}; not cached")
                continue
            f.write(json.dumps({
                "book_id": int(row.book_id), "description": d, "source": source, "matched_via": via,
                "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }) + "\n")
            f.flush()
            if i % 10 == 0:
                print(f"  {i}/{len(todo)}")

    cache = read_cache()
    sel = [cache[i] for i in books.book_id if i in cache]
    hit = [c for c in sel if c["description"]]
    print(f"\ncached outcomes for selection: {len(sel)}/{len(books)}  transient errors: {errors}")
    print(f"match rate: {len(hit)}/{len(sel)} = {len(hit) / max(len(sel), 1):.1%}")
    print("by source/via:", pd.Series([f"{c['source']}/{c['matched_via']}" for c in hit]).value_counts().to_dict())
