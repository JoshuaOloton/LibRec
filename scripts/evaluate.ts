/**
 * Offline evaluation harness (FR12).
 *   npx tsx scripts/evaluate.ts --configs content,collab,hybrid,hybrid-tuned,popular --seeds 1,2,3,4,5 --n 10
 * Reads the cleaned dataset CSVs directly, so the admin and demo accounts are never part of the benchmark.
 * Every configuration runs on the identical partition and imports the same engine code as the app.
 *
 * `hybrid` uses the initial weights (0.35 / 0.65). `hybrid-tuned` first runs a weight sweep on a validation split
 * carved from each seed's TRAINING data (never the test set), picks the best contentWeight by mean validation F1, and
 * then evaluates it once on the test partitions. Pass `--content-weight 0.4` to skip the sweep and fix the weight.
 */
import { parse } from "csv-parse/sync";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SPLIT_OPTIONS, splitInteractions, type EvalInteraction } from "@/lib/evaluation/split";
import {
  aggregate,
  COLD_START_THRESHOLD,
  evaluatePartition,
  evaluateSeed,
  RELEVANCE_THRESHOLD,
  SEGMENTS,
  type SeedResult,
} from "@/lib/evaluation/runner";
import { createEvalConfigs } from "@/lib/evaluation/configs";
import { DEFAULT_CONTENT_OPTIONS } from "@/lib/recommender/content";
import { DEFAULT_COLLABORATIVE_OPTIONS } from "@/lib/recommender/collaborative";
import { INITIAL_HYBRID_OPTIONS } from "@/lib/recommender/hybrid";

const ROOT = path.resolve(__dirname, "..");
/** The validation split of seed s uses seed VALIDATION_SEED_OFFSET + s (DECISIONS 2026-10-13). */
const VALIDATION_SEED_OFFSET = 1000;
const SWEEP_STEPS = 10;

const METRICS = [
  "users",
  "precision",
  "recall",
  "f1",
  "coverageNone",
  "coveragePartial",
  "coverageFull",
  "coveredUsers",
  "precisionCovered",
  "recallCovered",
  "f1Covered",
  "contentShare",
  "collabShare",
] as const;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** NaN (an undefined metric, e.g. precision over zero covered patrons) is written as an empty cell. */
function csvCell(x: unknown): string {
  return typeof x === "number" && Number.isNaN(x) ? "" : String(x);
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

  // The configurations live in lib/evaluation/configs.ts, shared with scripts/significance.ts.
  const { model, available, hybridConfig } = createEvalConfigs(books);
  const f = (a: { mean: number; std: number }, d = 4) => `${a.mean.toFixed(d)} ± ${a.std.toFixed(d)}`;
  const pct = (x: number) => (Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`);

  // Weight tuning: sweep contentWeight on a validation split carved from each seed's TRAINING rows only.
  let tuned: { contentWeight: number; source: "sweep" | "cli" } | null = null;
  let sweepOut: object | null = null;
  const fixedWeight = arg("content-weight", "");
  if (configNames.includes("hybrid-tuned")) {
    if (fixedWeight !== "") {
      tuned = { contentWeight: Number(fixedWeight), source: "cli" };
    } else {
      const grid = Array.from({ length: SWEEP_STEPS + 1 }, (_, i) => i / SWEEP_STEPS);
      const sweepConfigs = grid.map((w) => hybridConfig(`w${w.toFixed(1)}`, `contentWeight ${w.toFixed(1)}`, w));
      const sweepStarted = Date.now();
      const sweepResults: SeedResult[] = seeds.map((seed) => {
        const { train } = splitInteractions(interactions, seed); // the test rows are never looked at here
        const inner = splitInteractions(train, VALIDATION_SEED_OFFSET + seed);
        const r = evaluatePartition(inner.train, inner.test, seed, sweepConfigs, { n });
        console.log(`sweep seed ${seed}: ${r.testUsers} validation patrons, ${r.skippedUsers} skipped (${((Date.now() - sweepStarted) / 1000).toFixed(1)}s)`);
        return r;
      });
      const rows = grid.map((w, i) => ({ contentWeight: w, collabWeight: Math.round((1 - w) * 1000) / 1000, summary: aggregate(sweepResults, sweepConfigs[i].name) }));
      let best = rows[0];
      for (const row of rows) if (row.summary.segments.all.f1.mean > best.summary.segments.all.f1.mean) best = row;
      tuned = { contentWeight: best.contentWeight, source: "sweep" };

      console.log(`\nWeight sweep on the validation split (seeds ${seeds.join(",")}; N = ${n}; F1 over all evaluated patrons)`);
      console.log("contentWeight  collabWeight   P@N     R@N     F1@N (all)         F1@N warm          F1@N cold");
      for (const row of rows) {
        const a = row.summary.segments.all;
        console.log(
          `${row.contentWeight.toFixed(1).padStart(13)}  ${row.collabWeight.toFixed(1).padStart(12)}   ${a.precision.mean.toFixed(4)}  ${a.recall.mean.toFixed(4)}  ${f(a.f1).padEnd(17)}  ${f(row.summary.segments.warm.f1).padEnd(17)}  ${f(row.summary.segments.cold.f1)}${row === best ? "   <= best" : ""}`,
        );
      }
      console.log(`Validation patrons per seed (all/cold/warm): ${rows[0].summary.segments.all.users.perSeed.join("/")} | ${rows[0].summary.segments.cold.users.perSeed.join("/")} | ${rows[0].summary.segments.warm.users.perSeed.join("/")}\n`);

      sweepOut = {
        generatedAt: new Date().toISOString(),
        protocol: `Validation split carved from each seed's training rows with splitInteractions (seed ${VALIDATION_SEED_OFFSET} + seed, same pair-level rules). Chosen by highest mean validation F1@${n} over all evaluated patrons, averaged over seeds; ties go to the lower contentWeight. The test rows are not used.`,
        n,
        seeds,
        validationSeeds: seeds.map((s) => VALIDATION_SEED_OFFSET + s),
        grid: rows.map((r) => ({ contentWeight: r.contentWeight, collabWeight: r.collabWeight })),
        chosen: { contentWeight: best.contentWeight, collabWeight: best.collabWeight },
        perSeed: sweepResults,
        summary: Object.fromEntries(rows.map((r) => [r.contentWeight.toFixed(1), r.summary])),
      };
      const sweepBase = path.resolve(ROOT, arg("sweep-out", "results/sweep-validation"));
      mkdirSync(path.dirname(sweepBase), { recursive: true });
      writeFileSync(`${sweepBase}.json`, JSON.stringify(sweepOut, null, 2) + "\n");
      const sweepLines = [["contentWeight", "collabWeight", "segment", "metric", "mean", "std", ...seeds.map((s) => `seed_${s}`)].join(",")];
      for (const row of rows) {
        for (const seg of SEGMENTS) {
          for (const metric of METRICS) {
            const a = row.summary.segments[seg][metric];
            sweepLines.push([row.contentWeight, row.collabWeight, seg, metric, a.mean, a.std, ...a.perSeed].map(csvCell).join(","));
          }
        }
      }
      writeFileSync(`${sweepBase}.csv`, sweepLines.join("\n") + "\n");
      console.log(`Wrote ${path.relative(ROOT, sweepBase)}.json and .csv\n`);
    }
    available["hybrid-tuned"] = hybridConfig(
      "hybrid-tuned",
      `Hybrid, tuned weights (${tuned.contentWeight.toFixed(1)} content / ${(1 - tuned.contentWeight).toFixed(1)} collab; chosen on validation)`,
      tuned.contentWeight,
    );
  }

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
    hybridOptions: {
      ...INITIAL_HYBRID_OPTIONS,
      topN: n,
      normalisation: "A: min-max per patron over their candidates (0 if no spread); B: clamp to [1, 5] then (B - 1) / 4; a candidate with no CF prediction contributes 0 from CF",
      attribution: "CONTENT if contentWeight*A_norm >= collabWeight*B_norm, else COLLABORATIVE; cold-path items are CONTENT",
    },
    tunedWeights: tuned && {
      contentWeight: tuned.contentWeight,
      collabWeight: Math.round((1 - tuned.contentWeight) * 1000) / 1000,
      source: tuned.source,
    },
    coverageDefinition: "share of evaluated patrons receiving 0, 1..N-1 or N recommendations; no backfilling",
    supplementary:
      "*Covered metrics average P/R/F1 over only the patrons who received at least one recommendation; they are reported apart from the headline numbers. contentShare/collabShare: share of recommended items attributed to each component (hybrid only).",
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
      for (const metric of METRICS) {
        const a = summary[c.name].segments[seg][metric];
        lines.push([c.name, c.baseline ? "sanity-baseline" : "configuration", seg, metric, a.mean, a.std, ...a.perSeed].map(csvCell).join(","));
      }
    }
  }
  writeFileSync(`${base}.csv`, lines.join("\n") + "\n");

  console.log(`\nDataset: ${datasetStats.users} patrons, ${datasetStats.books} books, ${datasetStats.interactions} interactions, density ${datasetStats.densityPct.toFixed(2)}%`);
  console.log(`N = ${n}, seeds = ${seeds.join(",")}, relevant = real RATE >= ${RELEVANCE_THRESHOLD}\n`);
  for (const c of configs) {
    console.log(`${c.label}${c.baseline ? "  [sanity check only]" : ""}`);
    for (const seg of SEGMENTS) {
      const s = summary[c.name].segments[seg];
      console.log(
        `  ${seg.padEnd(5)} users≈${s.users.mean.toFixed(0).padStart(5)}  P@${n} ${f(s.precision)}  R@${n} ${f(s.recall)}  F1@${n} ${f(s.f1)}  coverage 0/1-${n - 1}/${n}: ${pct(s.coverageNone.mean)}/${pct(s.coveragePartial.mean)}/${pct(s.coverageFull.mean)}`,
      );
      const extras = [`  supplementary: covered ≈${s.coveredUsers.mean.toFixed(0)}, P@${n} on covered ${Number.isNaN(s.precisionCovered.mean) ? "n/a" : f(s.precisionCovered)}`];
      if (!Number.isNaN(s.contentShare.mean)) extras.push(`attribution content/collab ${pct(s.contentShare.mean)}/${pct(s.collabShare.mean)}`);
      console.log(`        ${extras.join("; ")}`);
    }
  }
  console.log(`\nWrote ${path.relative(ROOT, base)}.json and .csv`);
}

main();
