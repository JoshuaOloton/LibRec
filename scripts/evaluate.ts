/**
 * Offline evaluation harness (FR12).
 *   npx tsx scripts/evaluate.ts --configs content,popular --seeds 1,2,3,4,5 --n 10
 * Reads the cleaned dataset CSVs directly, so the admin and demo accounts are never part of the benchmark.
 * Every configuration runs on the identical partition and imports the same engine code as the app.
 */
import { parse } from "csv-parse/sync";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SPLIT_OPTIONS, type EvalInteraction } from "@/lib/evaluation/split";
import {
  aggregate,
  COLD_START_THRESHOLD,
  evaluateSeed,
  RELEVANCE_THRESHOLD,
  SEGMENTS,
  type EvalConfig,
} from "@/lib/evaluation/runner";
import { buildItemVectors, ContentRecommender, DEFAULT_CONTENT_OPTIONS } from "@/lib/recommender/content";
import { CollaborativeRecommender, DEFAULT_COLLABORATIVE_OPTIONS } from "@/lib/recommender/collaborative";
import { PopularRecommender } from "@/lib/recommender/popular";

const ROOT = path.resolve(__dirname, "..");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readCsv(file: string): Record<string, string>[] {
  return parse(readFileSync(path.join(ROOT, "data/processed", file)), { columns: true, skip_empty_lines: true });
}

function main() {
  const configNames = arg("configs", "content,popular").split(",");
  const seeds = arg("seeds", "1,2,3,4,5").split(",").map(Number);
  const n = Number(arg("n", "10"));

  const books = readCsv("books_clean.csv").map((b) => ({ id: Number(b.book_id), contentText: b.content_text }));
  const interactions: EvalInteraction[] = readCsv("interactions_clean.csv").map((r) => ({
    userId: Number(r.user_id),
    bookId: Number(r.book_id),
    type: r.type as "BORROW" | "RATE",
    ratingValue: r.rating_value === "" ? null : Number(r.rating_value),
  }));

  // TF-IDF is fitted once over the catalogue text (no interaction information; see DECISIONS 2026-10-13).
  const { model, vectors } = buildItemVectors(books);
  const content = new ContentRecommender(vectors, DEFAULT_CONTENT_OPTIONS);

  const available: Record<string, EvalConfig> = {
    content: { name: "content", label: "Content-based (TF-IDF + cosine)", baseline: false, build: () => content },
    collab: {
      name: "collab",
      label: "Collaborative (user-user Pearson)",
      baseline: false,
      // Fitted on training explicit ratings only; borrows never enter CF (DECISIONS 2026-10-13).
      build: (train) =>
        new CollaborativeRecommender(
          train
            .filter((r) => r.type === "RATE" && r.ratingValue !== null)
            .map((r) => ({ userId: r.userId, bookId: r.bookId, ratingValue: r.ratingValue! })),
          DEFAULT_COLLABORATIVE_OPTIONS,
        ),
    },
    popular: {
      name: "popular",
      label: "Most popular (sanity check, NOT part of the hypothesis)",
      baseline: true,
      build: (train) => {
        const readers = new Map<number, Set<number>>();
        for (const row of train) {
          let set = readers.get(row.bookId);
          if (!set) readers.set(row.bookId, (set = new Set()));
          set.add(row.userId);
        }
        return new PopularRecommender(new Map([...readers].map(([id, users]) => [id, users.size])));
      },
    },
  };
  const configs = configNames.map((name) => {
    if (!available[name]) throw new Error(`Unknown or not yet implemented config "${name}". Available: ${Object.keys(available)}`);
    return available[name];
  });

  const users = new Set(interactions.map((i) => i.userId));
  const pairs = new Set(interactions.map((i) => `${i.userId}:${i.bookId}`));
  const datasetStats = {
    books: books.length,
    users: users.size,
    interactions: interactions.length,
    rates: interactions.filter((i) => i.type === "RATE").length,
    borrows: interactions.filter((i) => i.type === "BORROW").length,
    userBookPairs: pairs.size,
    densityPct: (pairs.size / (books.length * users.size)) * 100,
    tfidfVocabulary: model.vocab.size,
  };

  const started = Date.now();
  const results = seeds.map((seed) => {
    const r = evaluateSeed(interactions, seed, configs, { n });
    console.log(`seed ${seed}: ${r.testUsers} test users, ${r.skippedUsers} without a relevant held-out book (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return r;
  });

  const summary = Object.fromEntries(configs.map((c) => [c.name, aggregate(results, c.name)]));

  const out = {
    generatedAt: new Date().toISOString(),
    n,
    seeds,
    relevanceRule: `A held-out item is relevant only if it is a real RATE with rating >= ${RELEVANCE_THRESHOLD}. Simulated borrows stay in training and never count as relevant.`,
    split: { ...DEFAULT_SPLIT_OPTIONS, unit: "whole (user, book) pairs", seededRng: "mulberry32" },
    coldStartThreshold: COLD_START_THRESHOLD,
    coldStartDefinition: "fewer than coldStartThreshold distinct books in training",
    evaluatedPatrons: "patrons with at least one relevant held-out book",
    contentOptions: DEFAULT_CONTENT_OPTIONS,
    collaborativeOptions: DEFAULT_COLLABORATIVE_OPTIONS,
    coverageDefinition: "share of evaluated patrons receiving 0, 1..N-1 or N recommendations; no backfilling",
    dataset: datasetStats,
    configs: configs.map((c) => ({ name: c.name, label: c.label, baseline: c.baseline })),
    perSeed: results,
    summary,
  };

  const slug = configNames.join("-");
  const base = path.resolve(ROOT, arg("out", `results/eval-${slug}`));
  mkdirSync(path.dirname(base), { recursive: true });
  writeFileSync(`${base}.json`, JSON.stringify(out, null, 2) + "\n");

  const header = ["config", "role", "segment", "metric", "mean", "std", ...seeds.map((s) => `seed_${s}`)];
  const lines = [header.join(",")];
  for (const c of configs) {
    for (const seg of SEGMENTS) {
      for (const metric of ["users", "precision", "recall", "f1", "coverageNone", "coveragePartial", "coverageFull"] as const) {
        const a = summary[c.name].segments[seg][metric];
        lines.push([c.name, c.baseline ? "sanity-baseline" : "configuration", seg, metric, a.mean, a.std, ...a.perSeed].join(","));
      }
    }
  }
  writeFileSync(`${base}.csv`, lines.join("\n") + "\n");

  console.log(`\nDataset: ${datasetStats.users} patrons, ${datasetStats.books} books, ${datasetStats.interactions} interactions, density ${datasetStats.densityPct.toFixed(2)}%`);
  console.log(`N = ${n}, seeds = ${seeds.join(",")}, relevant = real RATE >= ${RELEVANCE_THRESHOLD}\n`);
  const f = (a: { mean: number; std: number }, d = 4) => `${a.mean.toFixed(d)} ± ${a.std.toFixed(d)}`;
  const pct = (a: { mean: number }) => `${(a.mean * 100).toFixed(1)}%`;
  for (const c of configs) {
    console.log(`${c.label}${c.baseline ? "  [sanity check only]" : ""}`);
    for (const seg of SEGMENTS) {
      const s = summary[c.name].segments[seg];
      console.log(
        `  ${seg.padEnd(5)} users≈${s.users.mean.toFixed(0).padStart(5)}  P@${n} ${f(s.precision)}  R@${n} ${f(s.recall)}  F1@${n} ${f(s.f1)}  coverage 0/1-${n - 1}/${n}: ${pct(s.coverageNone)}/${pct(s.coveragePartial)}/${pct(s.coverageFull)}`,
      );
    }
  }
  console.log(`\nWrote ${path.relative(ROOT, base)}.json and .csv`);
}

main();
