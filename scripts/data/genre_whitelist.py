"""Step 3 (proposal only): genre whitelist from tags.csv + coverage preview.

Writes data/processed/genre_whitelist.csv (genre, merged_tags, books, share).
Does NOT assign genres to books; that happens after the whitelist is approved.
"""
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "processed"
TOP_GENRES = 3

# canonical genre -> raw tags merged into it
WHITELIST = {
    # fiction
    "fantasy": ["fantasy", "high-fantasy", "epic-fantasy", "dark-fantasy", "young-adult-fantasy", "fantasy-romance"],
    "urban-fantasy": ["urban-fantasy"],
    "science-fiction": ["science-fiction", "sci-fi-fantasy", "space-opera", "cyberpunk"],
    "dystopian": ["dystopian", "post-apocalyptic", "apocalyptic"],
    "romance": ["romance", "contemporary-romance", "historical-romance", "regency-romance"],
    "paranormal-romance": ["paranormal-romance"],
    "paranormal": ["paranormal", "supernatural", "vampires", "werewolves", "ghosts"],
    "mystery": ["mystery", "detective", "mystery-thriller"],
    "thriller": ["thriller", "suspense", "legal-thriller", "medical-thriller", "romantic-suspense", "espionage"],
    "crime": ["crime", "true-crime"],
    "horror": ["horror", "gothic"],
    "historical-fiction": ["historical-fiction", "medieval"],
    "literary-fiction": ["literary-fiction"],
    "contemporary-fiction": ["contemporary-fiction", "realistic-fiction", "coming-of-age"],
    "chick-lit": ["chick-lit"],
    "adventure": ["adventure"],
    "humor": ["humor", "humour", "comedy", "satire"],
    "classics": ["classics"],
    "war": ["war", "military-fiction"],
    "short-stories": ["short-stories"],
    "erotica": ["erotica"],
    "mythology": ["mythology", "fairy-tales", "fairy-tale"],
    "western": ["western"],
    # audience / format
    "young-adult": ["young-adult", "teen"],
    "middle-grade": ["middle-grade"],
    "childrens": ["children", "childrens", "picture-books"],
    "graphic-novels": ["graphic-novels", "graphic-novel", "comics", "comic-book", "manga", "superheroes"],
    "poetry": ["poetry"],
    "plays": ["plays", "play"],
    "lgbt": ["lgbt"],
    # non-fiction
    "non-fiction": ["non-fiction"],
    "biography": ["biography", "autobiography", "memoir", "memoirs", "biography-memoir"],
    "history": ["history"],
    "science": ["science", "mathematics", "technology", "computer-science", "nature"],
    "psychology": ["psychology", "mental-health"],
    "philosophy": ["philosophy"],
    "religion": ["religion", "christian", "spirituality"],
    "self-help": ["self-help", "self-development", "inspirational"],
    "politics": ["politics", "sociology", "feminism", "anthropology"],
    "business": ["business", "economics", "finance"],
    "travel": ["travel"],
    "art-music": ["art", "music"],
    "cooking": ["cooking", "cookbooks"],
    "essays": ["essays"],
    "health": ["health", "parenting"],
}

if __name__ == "__main__":
    t = pd.read_csv(RAW / "tags.csv")
    bt = pd.read_csv(RAW / "book_tags.csv")
    b = pd.read_csv(OUT / "books.csv")
    gr2id = dict(zip(b.goodreads_id, b.book_id))
    tag2genre = {tag: g for g, tags in WHITELIST.items() for tag in tags}
    assert len(tag2genre) == sum(map(len, WHITELIST.values())), "tag in two genres"
    missing = set(tag2genre) - set(t.tag_name)
    assert not missing, missing

    bt = bt[bt.goodreads_book_id.isin(gr2id)].merge(t, on="tag_id")
    bt = bt[bt.tag_name.isin(tag2genre)]
    bt["genre"] = bt.tag_name.map(tag2genre)
    bt["book_id"] = bt.goodreads_book_id.map(gr2id)
    bg = bt.groupby(["book_id", "genre"], as_index=False)["count"].sum()
    top = bg.sort_values(["book_id", "count"], ascending=[True, False]).groupby("book_id").head(TOP_GENRES)

    stats = bg.groupby("genre").book_id.nunique().rename("books_with_tag").to_frame()
    stats["books_in_top3"] = top.groupby("genre").book_id.nunique()
    stats["share_of_catalogue"] = (stats.books_in_top3 / len(b)).round(3)
    stats["merged_tags"] = [", ".join(WHITELIST[g]) for g in stats.index]
    stats = stats.sort_values("books_in_top3", ascending=False)
    stats.to_csv(OUT / "genre_whitelist.csv")
    pd.set_option("display.width", 250, "display.max_colwidth", 90)
    print(stats.to_string())
    n = top.groupby("book_id").size().reindex(b.book_id, fill_value=0)
    print(f"\ngenres: {len(WHITELIST)}  books: {len(b)}")
    print("books by number of genres assigned:", n.value_counts().sort_index().to_dict())
