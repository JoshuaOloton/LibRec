/**
 * Significance tests for the final comparison (DECISIONS 2026-10-13 Q6 and 2026-10-14).
 *   npx tsx scripts/significance.ts [--seeds 1,2,3,4,5] [--n 10]
 * Re-runs the harness on the same test partitions as results/eval-final.json (it checks that the means reproduce),
 * keeps each patron's F1@N, and compares configurations paired by patron:
 *   per seed: Wilcoxon signed-rank on the per-patron differences (Holm-adjusted across the three comparisons);
 *   across seeds: paired t-test on the per-seed mean differences.
 * Writes results/significance.json and results/significance.csv.
 */
import { parse } from "csv-parse/sync";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createEvalConfigs } from "@/lib/evaluation/configs";
import { mean } from "@/lib/evaluation/metrics";
import { evaluateSeed, type SeedResult } from "@/lib/evaluation/runner";
import type { EvalInteraction } from "@/lib/evaluation/split";
import { holmAdjust, pairedT, wilcoxonSignedRank, type PairedTResult, type WilcoxonResult } from "@/lib/evaluation/stats";

const ROOT = path.resolve(__dirname, "..");
const ALPHA = 0.05;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readCsv(file: string): Record<string, string>[] {
  return parse(readFileSync(path.join(ROOT, "data/processed", file)), { columns: true, skip_empty_lines: true });
}

const COMPARISONS = [
  { id: "tuned-vs-content", first: "hybrid-tuned", second: "content", label: "Hybrid (tuned 0.8/0.2) vs content-based" },
  { id: "tuned-vs-collab", first: "hybrid-tuned", second: "collab", label: "Hybrid (tuned 0.8/0.2) vs collaborative" },
  { id: "initial-vs-content", first: "hybrid", second: "content", label: "Hybrid (initial 0.35/0.65) vs content-based" },
] as const;
type Segment = "all" | "warm";
const SEGMENTS: Segment[] = ["all", "warm"];

interface PerSeedTest extends WilcoxonResult {
  seed: number;
  /** Holm-adjusted across the three comparisons of this seed and segment. */
  pHolm: number;
}

function main() {
  const seeds = arg("seeds", "1,2,3,4,5").split(",").map(Number);
  const n = Number(arg("n", "10"));

  // The tuned weight is the one chosen on validation in Cycle 4 and recorded in eval-final.json.
  const final = JSON.parse(readFileSync(path.join(ROOT, "results/eval-final.json"), "utf8"));
  const tunedWeight: number = final.tunedWeights.contentWeight;

  const books = readCsv("books_clean.csv").map((b) => ({ id: Number(b.book_id), contentText: b.content_text }));
  const interactions: EvalInteraction[] = readCsv("interactions_clean.csv").map((r) => ({
    userId: Number(r.user_id),
    bookId: Number(r.book_id),
    type: r.type as "BORROW" | "RATE",
    ratingValue: r.rating_value === "" ? null : Number(r.rating_value),
  }));

  const { available, hybridConfig } = createEvalConfigs(books);
  const configs = [
    available.content,
    available.collab,
    available.hybrid,
    hybridConfig("hybrid-tuned", `Hybrid, tuned weights (${tunedWeight} content)`, tunedWeight),
  ];

  const started = Date.now();
  const results: SeedResult[] = seeds.map((seed) => {
    const r = evaluateSeed(interactions, seed, configs, { n, collectPatrons: true });
    console.log(`seed ${seed}: ${r.patrons!.userIds.length} evaluated patrons (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return r;
  });

  // Reproduction check: the per-patron F1 means must equal the F1 reported in results/eval-final.json.
  const reproduced: Record<string, number> = {};
  for (const c of configs) {
    const perSeed = results.map((r) => mean(r.patrons!.f1[c.name]));
    const reported: number[] = final.summary[c.name].segments.all.f1.perSeed;
    const worst = Math.max(...perSeed.map((x, i) => Math.abs(x - reported[i])));
    reproduced[c.name] = worst;
    if (!(worst < 1e-12)) throw new Error(`${c.name}: per-patron F1 does not reproduce results/eval-final.json (max diff ${worst})`);
  }
  console.log("per-patron F1 means reproduce results/eval-final.json exactly");

  const out = {
    generatedAt: new Date().toISOString(),
    n,
    seeds,
    alpha: ALPHA,
    tunedContentWeight: tunedWeight,
    protocol: {
      quantity: "per-patron F1@N, difference = first - second, over the patrons evaluated in that seed (same patrons for both)",
      segments: { all: "every evaluated patron", warm: "patrons with >= 3 distinct training books (in the cold segment the hybrid equals content by construction)" },
      perSeed: "Wilcoxon signed-rank, normal approximation, tie-corrected variance, continuity correction, zeros dropped, two-sided; Holm-adjusted across the three comparisons within a seed and segment",
      acrossSeeds: "paired t-test on the per-seed mean differences, two-sided; Holm-adjusted across the three comparisons",
      effectSizes: "rank-biserial correlation (Wilcoxon, positive favours the first); Cohen's d_z (t-test)",
      decisionRule: "reject H0 against a baseline only if the hybrid is better (positive mean difference) and the Holm-adjusted Wilcoxon p < alpha in all seeds; the t-test is a robustness check",
    },
    reproducesFinal: reproduced,
    seedMeans: Object.fromEntries(configs.map((c) => [c.name, results.map((r) => mean(r.patrons!.f1[c.name]))])),
    comparisons: {} as Record<string, unknown>,
  };

  const csv = [
    ["comparison", "segment", "level", "seed", "n_pairs", "zeros", "mean_diff", "statistic", "p", "p_holm", "effect_size", "effect_size_type"].join(","),
  ];

  for (const seg of SEGMENTS) {
    // per seed: a Wilcoxon test per comparison, then Holm across the comparisons
    const tests = new Map<string, PerSeedTest[]>(COMPARISONS.map((c) => [c.id, []]));
    results.forEach((r, k) => {
      const p = r.patrons!;
      const keep = p.userIds.map((_, i) => i).filter((i) => seg === "all" || !p.cold[i]);
      const raw = COMPARISONS.map((c) =>
        wilcoxonSignedRank(keep.map((i) => p.f1[c.first][i] - p.f1[c.second][i])),
      );
      const adj = holmAdjust(raw.map((w) => (Number.isNaN(w.p) ? 1 : w.p)));
      COMPARISONS.forEach((c, j) => tests.get(c.id)!.push({ seed: seeds[k], ...raw[j], pHolm: adj[j] }));
    });

    // across seeds: paired t-test on the per-seed mean difference, then Holm
    const tRaw = COMPARISONS.map((c) =>
      pairedT(
        results.map((r) => {
          const p = r.patrons!;
          const keep = p.userIds.map((_, i) => i).filter((i) => seg === "all" || !p.cold[i]);
          return mean(keep.map((i) => p.f1[c.first][i])) - mean(keep.map((i) => p.f1[c.second][i]));
        }),
      ),
    );
    const tAdj = holmAdjust(tRaw.map((t) => (Number.isNaN(t.p) ? 1 : t.p)));

    COMPARISONS.forEach((c, j) => {
      const perSeed = tests.get(c.id)!;
      const t: PairedTResult & { pHolm: number } = { ...tRaw[j], pHolm: tAdj[j] };
      const allSeedsBetter = perSeed.every((w) => w.meanDiff > 0 && w.pHolm < ALPHA);
      const allSeedsWorse = perSeed.every((w) => w.meanDiff < 0 && w.pHolm < ALPHA);
      (out.comparisons as Record<string, unknown>)[`${c.id}/${seg}`] = {
        label: c.label,
        first: c.first,
        second: c.second,
        segment: seg,
        perSeed,
        acrossSeeds: t,
        verdict: allSeedsBetter ? "first significantly better in every seed" : allSeedsWorse ? "first significantly worse in every seed" : "no consistent significant difference",
        significantInSeeds: perSeed.filter((w) => w.pHolm < ALPHA).length,
      };
      for (const w of perSeed) {
        csv.push([c.id, seg, "seed-wilcoxon", w.seed, w.n, w.zeros, w.meanDiff, w.z, w.p, w.pHolm, w.rankBiserial, "rank-biserial"].join(","));
      }
      csv.push([c.id, seg, "across-seeds-t", "", t.n, "", t.meanDiff, t.t, t.p, t.pHolm, t.dz, "cohen-dz"].join(","));
    });
  }

  mkdirSync(path.join(ROOT, "results"), { recursive: true });
  writeFileSync(path.join(ROOT, "results/significance.json"), JSON.stringify(out, null, 2) + "\n");
  writeFileSync(path.join(ROOT, "results/significance.csv"), csv.join("\n") + "\n");

  // Console summary
  const fmtP = (p: number) => (Number.isNaN(p) ? "n/a" : p === 0 ? "<1e-300" : p < 0.001 ? p.toExponential(2) : p.toFixed(4));
  for (const seg of SEGMENTS) {
    console.log(`\n=== segment: ${seg} ===`);
    for (const c of COMPARISONS) {
      const r = (out.comparisons as Record<string, { perSeed: PerSeedTest[]; acrossSeeds: PairedTResult & { pHolm: number }; verdict: string }>)[`${c.id}/${seg}`];
      console.log(`\n${c.label}`);
      for (const w of r.perSeed) {
        console.log(
          `  seed ${w.seed}: n=${String(w.n).padStart(4)} (zeros ${String(w.zeros).padStart(4)})  mean diff ${w.meanDiff >= 0 ? "+" : ""}${w.meanDiff.toFixed(5)}  W+=${w.wPlus} W-=${w.wMinus}  z=${w.z.toFixed(2)}  p=${fmtP(w.p)}  p(Holm)=${fmtP(w.pHolm)}  r_rb=${w.rankBiserial.toFixed(3)}`,
        );
      }
      const t = r.acrossSeeds;
      console.log(`  across seeds: mean diff ${t.meanDiff >= 0 ? "+" : ""}${t.meanDiff.toFixed(5)}  t(${t.df})=${t.t.toFixed(3)}  p=${fmtP(t.p)}  p(Holm)=${fmtP(t.pHolm)}  d_z=${t.dz.toFixed(2)}`);
      console.log(`  verdict: ${r.verdict}`);
    }
  }
  console.log("\nWrote results/significance.json and results/significance.csv");
}

main();
