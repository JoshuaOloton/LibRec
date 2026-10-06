# Specification: Intelligent Library Book Recommendation System

Source: *Seminar Report v2.1*, Etor & Abdulraheem, HND Computer Science, Yaba College of Technology (Aug 2026).
Supervisors: Dr. Rufai M., Mrs Gift Ifechukwudi.

## 1. Aim and hypothesis

Design and implement a hybrid recommender (TF-IDF CBF + Pearson CF). Evaluate it with Precision, Recall and F1 against
CBF-only and CF-only baselines on the same data under the same protocol.

- **H0:** the hybrid gives no significant improvement over the baselines.
- **H1:** the hybrid gives a significant improvement.
- The test quantity is (hybrid metric) − (better baseline metric).

## 2. Actors and use cases

- **Patron:** register, log in, browse and search the catalogue, view personalised recommendations, borrow or rate a
  book (recording an interaction is a first-class use case).
- **Administrator:** log in, manage catalogue entries, view usage and circulation statistics.
- **External data source:** the public book/ratings dataset bootstraps the catalogue and interactions.

## 3. Functional requirements

| ID | Requirement | Cycle |
|---|---|---|
| FR1 | Patron creates an account and authenticates | 1 |
| FR2 | Browse and search the catalogue by title, author and genre | 1 |
| FR3 | Record borrowing and rating interactions | 1 |
| FR4 | Content-based score via TF-IDF + cosine similarity | 2 |
| FR5 | Collaborative score via Pearson user similarity | 3 |
| FR6 | Patrons with < 3 interactions go through the content-based path only | 4 |
| FR7 | Normalise both scores to a common range before combining | 4 |
| FR8 | Ranked recommendation list for an authenticated patron | 4 |
| FR9 | Log every served recommendation with its source component | 5 |
| FR10 | Admin adds, updates and removes books and metadata | 1 |
| FR11 | Admin views usage and circulation statistics | 5 |
| FR12 | Evaluate recommendation quality against held-out data | 5 |

## 4. Non-functional requirements

| ID | Attribute | Requirement | Verification |
|---|---|---|---|
| NFR1 | Perceived usefulness | Recommendations are clearly surfaced, each with a reason it was suggested | UAT |
| NFR2 | Ease of use | A first-time user gets a recommendation within 3 interactions | UAT / TC15 |
| NFR3 | Maintainability | CBF, CF and hybrid are separable modules, each independently testable and tunable | Review; standalone evals in Cycles 2–3 |
| NFR4 | Performance | Recommendations for one patron return in interactive time at prototype scale | Response-time measurement |
| NFR5 | Scalability | The data model and algorithms extend to a larger catalogue without structural change | Design / complexity review |
| NFR6 | Security | Passwords stored with industry-standard hashing | Code review / TC02 |

Suggested concrete target for NFR4, since the report doesn't give a number: p95 < 1 s for a catalogue of about 10k books.

## 5. Test case schedule

| ID | Area | Input | Expected | Req |
|---|---|---|---|---|
| TC01 | Registration/login | Valid registration, then valid credentials | Account created; patron authenticated and taken to the catalogue | FR1 |
| TC02 | Credential storage | Inspect a stored password | A hash, not plaintext | NFR6 |
| TC03 | Catalogue search | Search by title, then author, then genre | Matching records for each field | FR2 |
| TC04 | Interaction recording | Borrow one book, rate another | Both rows written with correct type and timestamp | FR3 |
| TC05 | Content scoring | Patron with known history requests recommendations | CBF scores for all candidates; metadata-similar books score higher | FR4 |
| TC06 | Collaborative scoring | Patron with ratings overlapping other patrons' | CF scores computed; neighbours found by Pearson | FR5 |
| TC07 | Cold-start switch | Patron with **2** interactions | Content path only; CF **not invoked** | FR6 |
| TC08 | Threshold boundary | Patron with exactly **3** interactions | Hybrid path; both components invoked | FR6 |
| TC09 | Normalisation | Native-range scores from both components | Both mapped to a common range; combined score reflects the weights | FR7 |
| TC10 | Ranked output | Any patron requests recommendations | Top-N sorted by final score, descending | FR8 |
| TC11 | Logging | Any served recommendation | Log row with book, source component, score, timestamp | FR9 |
| TC12 | Catalogue admin | Admin adds, updates and removes a book | Catalogue reflects each change; BookFeature regenerated on update | FR10 |
| TC13 | Statistics | Admin requests stats | Report generated from recorded interactions | FR11 |
| TC14 | Eval harness | Run 3 configurations on one partition | P/R/F1 for each under an identical protocol | FR12 |
| TC15 | Simplicity | First-time patron | Recommendation within 3 interactions | NFR2 |

## 6. Evaluation metrics

| Metric | Definition | Supports |
|---|---|---|
| Precision@N | Share of the top-N found in the patron's held-out interactions | Hybrid vs each baseline |
| Recall@N | Share of the held-out interactions that appear in the top-N | Hybrid vs each baseline |
| F1@N | Harmonic mean of the two | Single combined comparison |
| Component attribution | Share of hybrid output coming from each component (from the log) | Whether one component dominates |
| Cold-start segment | P/R/F1 split by patrons below and above the threshold | Whether switching helps cold-start |
| Functional pass rate | % of TC01–TC15 passing | Correctness |

Reliability: run multiple random partitions with recorded seeds, and report the mean and spread of each metric.

## 7. Data

- **Chosen:** goodbooks-10k (10k books, ~6M ratings on a 1–5 scale, user tags). It lacks genre and description, so those
  are derived from tags and fetched from Open Library / Google Books. Its ratings are too dense for a library, so users
  are sampled and their ratings thinned to library-like counts (seeded), with the sparsity reported before and after.
- A **simulated interaction set** generated against the cleaned catalogue to mimic academic-library usage. It must
  **preserve sparsity**, because dense data flatters CF and hides the hybrid's value.
- Lower bound on catalogue size: about 727 books (Ridhwanullah & Fudholi 2025 showed TF-IDF is viable at that scale).
- Report the final item, patron and interaction counts and the sparsity. No figures are fixed in advance.

## 8. Open questions and gaps to settle before or during the build

The report leaves these unspecified. Each needs a decision, and Claude Code should not guess silently. Record each
decision in a `docs/DECISIONS.md`.

1. ~~**Which dataset?**~~ **Decided:** goodbooks-10k. Genres come from whitelisted user tags, and descriptions are
   enriched from Open Library / Google Books ("Option C": tags + author + description). Book-Crossing was rejected
   because it has no genre or description. See the CLAUDE.md data pipeline.
2. **How does a borrow become a rating?** Pearson needs numeric ratings, but `borrow` interactions have no
   `rating_value`. Options: an implicit rating (for example, borrow = 3.5), ratings-only CF, or a mixed scheme.
3. **What counts toward the "3 interactions" threshold:** all interactions, or only ratings? A patron with 3 borrows and
   no ratings would enter the hybrid path with no Pearson signal.
4. **Pearson details:** the minimum number of co-rated items for a valid similarity, the neighbourhood size k, and
   whether negative correlations are used. None is specified.
5. **Normalisation method:** min-max per request, or a global fixed range? Cosine is in [0,1] for TF-IDF; predicted
   ratings fall on the rating scale.
6. **Item cold-start scale fairness:** if a candidate with no ratings gets `final = A` while others get `0.35A + 0.65B`,
   new books are systematically mis-ranked. Options: `final = content_weight·A`, re-normalising the weights to 1 using
   A only, or imputing B with the neighbourhood mean.
7. **Relevance in evaluation:** does any held-out interaction count as relevant, or only ratings ≥ some threshold? And
   what is N (5? 10?)?
8. **Partitioning:** random per-interaction (as the report says) vs per-user hold-out. Make sure every test patron keeps
   enough training interactions.
9. **Significance test:** H0/H1 say "significant", but no test is named. A paired t-test or Wilcoxon over per-user
   F1 across seeds would work.
10. **Admin statistics (FR11):** contents undefined. Suggested: top borrowed/rated books, interactions over time,
    never-interacted books (underused holdings), and the recommendation source mix.
11. **The "why" explanations (NFR1):** the format is not designed. CBF: the most similar previously-rated book. CF:
    "N readers with similar taste rated this highly."
12. ~~**Storing `tfidf_vector`**~~ **Decided:** sparse JSON `{termIndex: weight}` in `BookFeature`, loaded into an
    in-memory cache at server start.
13. **Interface latency:** precompute the user–user similarity matrix (refresh on a schedule or event) vs compute per
    request.

## 9. Report inconsistencies (fix in the report, not the code)

- Table numbers are cross-referenced wrongly in places. §3.12.1 says the hybrid strategy is in "Table 3.6" (it is
  Table 3.7). §3.12.10 says the dev cycles are in "Table 3.7" (they are in Table 3.8). §3.9 calls the test schedule
  "Table 3.8" (it is Table 3.11). Table 2.3 points to "Section 3.6" for the evaluation design (the evaluation is §3.17).
- The list of tables is out of order (3.3 is listed after 2.3 and before 3.4).
- The ERD includes `book_features.generated_at`, but Table 3.6 omits it. The code follows the ERD.
- The ERD names the user field `hashed_password`, while Table 3.6 says `password_hash`. Pick one.
