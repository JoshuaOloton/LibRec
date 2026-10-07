"""Step 6: keep ratings for surviving books, cap each user at 30 (seeded random), then drop users with <3.
Reads data/processed/{books_text,ratings}.csv; writes ratings_sparse.csv and step6_report.json."""
import json
import numpy as np, pandas as pd

SEED, CAP, MIN = 42, 30, 3
P = "data/processed/"
books = pd.read_csv(P + "books_text.csv", usecols=["book_id"])
r = pd.read_csv(P + "ratings.csv")

def stats(df, n_books):
    pu = df.groupby("user_id").size()
    return dict(users=int(pu.size), ratings=len(df), books=int(df.book_id.nunique()),
                density_pct=round(100 * len(df) / (pu.size * n_books), 3),
                mean_per_user=round(pu.mean(), 2), median_per_user=float(pu.median()),
                bands={"3-4": int(pu.between(3, 4).sum()), "5-15": int(pu.between(5, 15).sum()),
                       "16-30": int(pu.between(16, 30).sum()), "<3": int((pu < 3).sum()), ">30": int((pu > 30).sum())})

n_books = len(books)
r = r[r.book_id.isin(books.book_id)].drop_duplicates(["user_id", "book_id"])
before = stats(r, n_books)
rng = np.random.default_rng(SEED)
r = r.sort_values(["user_id", "book_id"]).reset_index(drop=True)  # deterministic order before shuffling
r["_k"] = rng.random(len(r))
r = r.sort_values(["user_id", "_k"])
capped = r.groupby("user_id").head(CAP).drop(columns="_k")
after_cap = stats(capped, n_books)
final = capped.groupby("user_id").filter(lambda g: len(g) >= MIN).sort_values(["user_id", "book_id"])
after = stats(final, n_books)
final.to_csv(P + "ratings_sparse.csv", index=False)
rep = dict(seed=SEED, cap=CAP, min_ratings=MIN, catalogue_books=n_books,
           before_cap=before, after_cap=after_cap, final=after,
           books_without_ratings=int(n_books - final.book_id.nunique()),
           rating_value_counts={int(k): int(v) for k, v in final.rating.value_counts().sort_index().items()})
json.dump(rep, open(P + "step6_report.json", "w"), indent=1)
print(json.dumps(rep, indent=1))
