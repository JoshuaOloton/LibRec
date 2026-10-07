"""Step 5: build content_text = genres + author + cleaned description; re-check null-language books.
Reads data/processed/books.csv + data/cache/descriptions.jsonl; writes data/processed/books_text.csv
and data/processed/step5_report.json. Deterministic (spot-check uses a fixed seed)."""
import html, json, random, re
import pandas as pd

P = "data/processed/"
EN = set("the of and a to in is that it was he she his her for with as on had at by not but be this from they have you are or were which an their one all would there been who when what so if no said".split())
FOREIGN = set("de la le les des et en un une est que il elle pour dans qui sur pas par el los las del y un una se por con para su es die der und das ist nicht ein eine zu den mit von auf sich il lo di che per da non sono come più dei delle e o os um uma em do da dos nos".split())
NOISE = re.compile(r"(the plot contains[^.]*\.|contains (mild|strong)[^.]*\.|book #?\d+\.?|originally published[^.]*\.)", re.I)

def words(s): return re.findall(r"[a-z0-9']+", s.lower())

def norm_tok(w):
    return {"seventeen": "17", "sixteen": "16", "eighteen": "18"}.get(w, w).replace("-year-old", "")

def clean_desc(t):
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"\*\*|__", "", t)  # markdown bold
    t = NOISE.sub(" ", t)
    t = re.sub(r"\s+", " ", t).strip()
    sents = re.split(r"(?<=[.!?])\s+", t)
    kept, sets = [], []
    for s in sents:
        ws = {norm_tok(w) for w in words(s)}
        if len(ws) < 3:
            continue
        # drop a sentence that is (near-)duplicate of an earlier one (Jaccard >= 0.7)
        if any(len(ws & o) / len(ws | o) >= 0.7 for o in sets):
            continue
        kept.append(s); sets.append(ws)
    return " ".join(kept)

def lang_guess(t):
    ws = words(t)
    if len(ws) < 8: return "unknown"
    en = sum(w in EN for w in ws) / len(ws); fo = sum(w in FOREIGN for w in ws) / len(ws)
    return "en" if en >= 0.15 and en > fo * 1.5 else ("non-en" if fo > en else "unknown")

b = pd.read_csv(P + "books.csv")
d = {}
for l in open("data/cache/descriptions.jsonl"):
    r = json.loads(l); d[r["book_id"]] = r
b["raw_desc"] = b.book_id.map(lambda i: d.get(i, {}).get("description"))
b["matched_via"] = b.book_id.map(lambda i: d.get(i, {}).get("matched_via"))
b["description"] = b.raw_desc.map(lambda t: clean_desc(t) if isinstance(t, str) else "")
b["desc_sentences_removed"] = b.raw_desc.map(lambda t: 0 if not isinstance(t, str) else 0)

b["lang_guess"] = b.description.map(lang_guess)
nullmask = b.language_code.isna()
# a clearly non-English description is a wrong-edition match: discard the description, keep the book
# (genres + author remain); the book's language is judged from title/author, not the blurb.
dropped = b[nullmask & (b.lang_guess == "non-en")]
flag = b[nullmask & (b.lang_guess == "unknown")]
b.loc[dropped.index, "description"] = ""

b["genres_text"] = b.genres.fillna("").str.replace("|", " ", regex=False).str.replace("-", " ", regex=False)
b["content_text"] = (b.genres_text + ". " + b.first_author.fillna("") + ". " + b.description).str.strip()
has_g = b.genres.notna() & (b.genres != "")
has_d = b.description != ""
neither = b[~has_g & ~has_d]
b = b.drop(neither.index)
b["has_description"] = b.description != ""
b.drop(columns=["raw_desc", "desc_sentences_removed", "genres_text"]).to_csv(P + "books_text.csv", index=False)

rep = dict(
    books_in=1000, non_english_description_discarded=dropped[["book_id", "title"]].to_dict("records"),
    null_lang_unknown_kept=flag[["book_id", "title"]].to_dict("records"),
    dropped_neither=neither.book_id.tolist(), books_out=len(b),
    with_description=int(b.has_description.sum()), without_description=int((~b.has_description).sum()),
    avg_content_text_chars=round(b.content_text.str.len().mean(), 1),
    avg_content_text_words=round(b.content_text.map(lambda s: len(words(s))).mean(), 1),
    avg_description_chars_with_desc=round(b[b.has_description].description.str.len().mean(), 1),
    min_content_text_chars=int(b.content_text.str.len().min()),
)
json.dump(rep, open(P + "step5_report.json", "w"), indent=1)
print(json.dumps({k: v for k, v in rep.items()}, indent=1))

# duplicate-sentence effect
raw = pd.read_csv(P + "books.csv").book_id.map(lambda i: d.get(i, {}).get("description"))
shrunk = sum(1 for t in raw if isinstance(t, str) and len(clean_desc(t)) < 0.9 * len(re.sub(r"<[^>]+>", " ", t)))
print("descriptions shortened >10% by dedupe/noise:", shrunk)

# spot-check 10 title_author matches
ta = b[b.matched_via == "title_author"]
print("\ntitle_author matches kept:", len(ta))
for _, r in ta.sample(10, random_state=7).iterrows():
    print(f"\n#{r.book_id} {r.title_clean} — {r.first_author} ({r.original_publication_year})\n   {r.description[:220]}")
