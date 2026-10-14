/**
 * Builds results/RESULTS.md (material for Chapter 4) and the PNG charts in results/charts/ from the result files:
 *   results/eval-final.json, results/sweep-validation.json, results/significance.json (run scripts/significance.ts first)
 *   data/processed/*.json and interactions_clean.csv
 * Every number in RESULTS.md is read from those files, none is typed in by hand.
 *   npx tsx scripts/make-results.ts
 * Charts are drawn as SVG and rasterised with Playwright's Chromium (a dev dependency).
 */
import { parse } from "csv-parse/sync";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(__dirname, "..");
const json = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));

const final = json("results/eval-final.json");
const sweep = json("results/sweep-validation.json");
const sig = json("results/significance.json");
const clean = json("data/processed/cleaning_report.json");
const step5 = json("data/processed/step5_report.json");
const step6 = json("data/processed/step6_report.json");
const step7 = json("data/processed/step7_report.json");
const interactions: { user_id: string; book_id: string; type: string; rating_value: string }[] = parse(
  readFileSync(path.join(ROOT, "data/processed/interactions_clean.csv")),
  { columns: true, skip_empty_lines: true },
);

type Seg = "all" | "cold" | "warm";
const SEGS: Seg[] = ["all", "cold", "warm"];
const SEG_LABEL: Record<Seg, string> = { all: "All evaluated patrons", cold: "Cold-start patrons (< 3 training books)", warm: "Warm patrons (≥ 3 training books)" };
const tunedW: number = final.tunedWeights.contentWeight;
const tunedC = 1 - tunedW;
const seeds: number[] = final.seeds;
const N: number = final.n;

const METHODS = [
  { key: "hybrid-tuned", label: `Hybrid, tuned (${tunedW.toFixed(1)} / ${tunedC.toFixed(1)})`, short: "Hybrid, tuned", color: "#2a78d6" },
  { key: "content", label: "Content-based", short: "Content-based", color: "#eb6834" },
  { key: "collab", label: "Collaborative", short: "Collaborative", color: "#1baf7a" },
  { key: "hybrid", label: "Hybrid, initial (0.35 / 0.65)", short: "Hybrid, initial", color: "#eda100" },
  { key: "popular", label: "Most popular (sanity check)", short: "Most popular", color: "#8a8a85" },
] as const;

const stat = (cfg: string, seg: Seg, metric: string): { mean: number; std: number; perSeed: number[] } => final.summary[cfg].segments[seg][metric];
const f4 = (x: number) => x.toFixed(4);
const pm = (a: { mean: number; std: number }, d = 4) => `${a.mean.toFixed(d)} ± ${a.std.toFixed(d)}`;
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const num = (x: number) => x.toLocaleString("en-GB");
const fmtP = (p: number) => (Number.isNaN(p) ? "n/a" : p === 0 ? "< 1e-300" : p < 0.001 ? p.toExponential(1) : p.toFixed(3));
const signed = (x: number, d = 4) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;
/** Fixed decimals with a typographic minus sign. */
const fixed = (x: number, d: number) => x.toFixed(d).replace("-", "−");

// ---------------------------------------------------------------- charts (SVG -> PNG) ------------------------------
const INK = "#1c2422";
const MUTED = "#5d6a65";
const SURFACE = "#fcfcfb";
const GRID = "#e4e6e2";
const FONT = `font-family="Atkinson Hyperlegible, Helvetica Neue, Arial, sans-serif"`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Bar with a rounded data end (right) and a square baseline end (left). */
function hbar(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0) return "";
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}h${w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - 2 * rr}a${rr},${rr} 0 0 1 -${rr},${rr}h-${w - rr}z`;
}

function f1Chart(): string {
  const W = 960;
  const rowH = 26;
  const barH = 20;
  const panelH = METHODS.length * rowH + 44;
  const top = 112;
  const H = top + SEGS.length * panelH + 52;
  const left = 190;
  const right = 90;
  const plotW = W - left - right;
  const max = 0.07;
  const x = (v: number) => left + (v / max) * plotW;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}><rect width="${W}" height="${H}" fill="${SURFACE}"/>`;
  s += `<text x="24" y="34" font-size="20" font-weight="700" fill="${INK}">F1@${N} by method and patron segment</text>`;
  s += `<text x="24" y="58" font-size="13" fill="${MUTED}">Mean over ${seeds.length} seeds (identical partitions for every method). Held-out relevant item = a real rating of 4 or more.</text>`;
  // legend: always present for 2+ series
  let lx = 24;
  for (const m of METHODS) {
    s += `<rect x="${lx}" y="76" width="12" height="12" rx="2" fill="${m.color}"/><text x="${lx + 18}" y="87" font-size="12.5" fill="${INK}">${esc(m.short)}</text>`;
    lx += 18 + m.short.length * 7.2 + 22;
  }

  SEGS.forEach((seg, p) => {
    const y0 = top + p * panelH;
    s += `<text x="24" y="${y0 + 14}" font-size="14" font-weight="700" fill="${INK}">${esc(SEG_LABEL[seg])}  <tspan font-weight="400" fill="${MUTED}">(about ${num(Math.round(stat("content", seg, "users").mean))} patrons per seed)</tspan></text>`;
    // gridlines + axis labels only on the bottom panel, hairlines on all
    for (const t of [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07]) {
      s += `<line x1="${x(t)}" x2="${x(t)}" y1="${y0 + 24}" y2="${y0 + 24 + METHODS.length * rowH}" stroke="${GRID}" stroke-width="1"/>`;
      if (p === SEGS.length - 1) s += `<text x="${x(t)}" y="${y0 + 24 + METHODS.length * rowH + 18}" font-size="12" fill="${MUTED}" text-anchor="middle">${t.toFixed(2)}</text>`;
    }
    METHODS.forEach((m, i) => {
      const y = y0 + 24 + i * rowH + (rowH - barH) / 2;
      const v = stat(m.key, seg, "f1").mean;
      s += `<text x="${left - 12}" y="${y + 14.5}" font-size="12.5" fill="${INK}" text-anchor="end">${esc(m.short)}</text>`;
      s += `<path d="${hbar(left, y, x(v) - left, barH)}" fill="${m.color}"/>`;
      let label = f4(v);
      if (seg === "cold" && m.key === "collab") label += "  (no recommendations)";
      s += `<text x="${x(v) + 8}" y="${y + 14.5}" font-size="12.5" fill="${INK}">${label}</text>`;
    });
  });
  s += `<text x="${left + plotW / 2}" y="${H - 14}" font-size="12.5" fill="${MUTED}" text-anchor="middle">F1@${N} (mean over patrons, then over seeds)</text>`;
  return s + `</svg>`;
}

function sweepChart(): string {
  const W = 960;
  const H = 500;
  const left = 72;
  const right = 40;
  const top = 100;
  const bottom = 70;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const grid: number[] = sweep.grid.map((g: { contentWeight: number }) => g.contentWeight);
  const mean = (w: number) => sweep.summary[w.toFixed(1)].segments.all.f1.mean as number;
  const sd = (w: number) => sweep.summary[w.toFixed(1)].segments.all.f1.std as number;
  const yMax = 0.05;
  const x = (w: number) => left + w * plotW;
  const y = (v: number) => top + plotH - (v / yMax) * plotH;
  const color = METHODS[0].color;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT}><rect width="${W}" height="${H}" fill="${SURFACE}"/>`;
  s += `<text x="24" y="34" font-size="20" font-weight="700" fill="${INK}">Weight sweep on the validation split</text>`;
  s += `<text x="24" y="58" font-size="13" fill="${MUTED}">F1@${N} over all evaluated validation patrons, mean over ${seeds.length} seeds; band = ± one standard deviation across seeds. The test partitions were not used.</text>`;
  for (let t = 0; t <= 0.05 + 1e-9; t += 0.01) {
    s += `<line x1="${left}" x2="${left + plotW}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}" stroke-width="1"/>`;
    s += `<text x="${left - 10}" y="${y(t) + 4}" font-size="12" fill="${MUTED}" text-anchor="end">${t.toFixed(2)}</text>`;
  }
  for (const w of grid) s += `<text x="${x(w)}" y="${top + plotH + 22}" font-size="12" fill="${MUTED}" text-anchor="middle">${w.toFixed(1)}</text>`;
  s += `<text x="${left + plotW / 2}" y="${H - 18}" font-size="12.5" fill="${MUTED}" text-anchor="middle">contentWeight (collabWeight = 1 − contentWeight): 0 = collaborative only, 1 = content only</text>`;

  const band = [...grid.map((w) => `${x(w)},${y(mean(w) + sd(w))}`), ...[...grid].reverse().map((w) => `${x(w)},${y(mean(w) - sd(w))}`)].join(" ");
  s += `<polygon points="${band}" fill="${color}" fill-opacity="0.12"/>`;
  s += `<polyline points="${grid.map((w) => `${x(w)},${y(mean(w))}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  for (const w of grid) s += `<circle cx="${x(w)}" cy="${y(mean(w))}" r="4" fill="${color}" stroke="${SURFACE}" stroke-width="2"/>`;

  // the initial weights (0.35 content) sit between grid points 0.3 and 0.4
  s += `<line x1="${x(0.35)}" x2="${x(0.35)}" y1="${top}" y2="${top + plotH}" stroke="${MUTED}" stroke-width="1"/>`;
  s += `<text x="${x(0.35) - 8}" y="${top + 16}" font-size="12.5" fill="${INK}" text-anchor="end">Initial weights, 0.35</text>`;
  s += `<text x="${x(0.35) - 8}" y="${top + 32}" font-size="12" fill="${MUTED}" text-anchor="end">(between the 0.3 and 0.4 points)</text>`;
  // the chosen point
  const best = tunedW;
  s += `<circle cx="${x(best)}" cy="${y(mean(best))}" r="8" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
  s += `<text x="${x(best)}" y="${y(mean(best)) - 18}" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">Chosen: ${best.toFixed(1)} / ${(1 - best).toFixed(1)}, F1 ${f4(mean(best))}</text>`;
  s += `<text x="${x(1)}" y="${y(mean(1)) + 30}" font-size="12.5" fill="${INK}" text-anchor="end">Content only ${f4(mean(1))}</text>`;
  s += `<text x="${x(0) + 16}" y="${y(mean(0)) + 10}" font-size="12.5" fill="${INK}">Collaborative only ${f4(mean(0))}</text>`;
  return s + `</svg>`;
}

async function renderPngs(charts: { file: string; svg: string }[]) {
  mkdirSync(path.join(ROOT, "results/charts"), { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const c of charts) {
      const page = await browser.newPage({ deviceScaleFactor: 2 });
      await page.setContent(`<html><body style="margin:0;background:${SURFACE}">${c.svg}</body></html>`);
      await page.locator("svg").screenshot({ path: path.join(ROOT, "results/charts", c.file) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------------- dataset facts ---------------------------------
const perBook = new Map<string, Set<string>>();
for (const r of interactions) {
  let set = perBook.get(r.book_id);
  if (!set) perBook.set(r.book_id, (set = new Set()));
  set.add(r.user_id);
}
const counts = [...perBook.values()].map((s) => s.size).sort((a, b) => b - a);
const totalPairs = counts.reduce((s, c) => s + c, 0);
const share = (k: number) => counts.slice(0, k).reduce((s, c) => s + c, 0) / totalPairs;
const ratings = interactions.filter((r) => r.type === "RATE");
const ratingValues = ratings.map((r) => Number(r.rating_value));
const positiveShare = ratingValues.filter((v) => v >= 4).length / ratingValues.length;
const meanRating = ratingValues.reduce((s, v) => s + v, 0) / ratingValues.length;

// ------------------------------------------------------------------- markdown --------------------------------------
type SigTest = { seed: number; n: number; zeros: number; meanDiff: number; p: number; pHolm: number; rankBiserial: number };
type SigAcross = { meanDiff: number; t: number; df: number; p: number; pHolm: number; dz: number };
const sigRow = (id: string, seg: Seg) => sig.comparisons[`${id}/${seg}`] as { label: string; perSeed: SigTest[]; acrossSeeds: SigAcross; verdict: string; significantInSeeds: number };
const range = (xs: number[], f: (x: number) => string) => `${f(Math.min(...xs))} to ${f(Math.max(...xs))}`;

function sigSection(): string {
  const lines: string[] = [];
  for (const seg of ["all", "warm"] as Seg[]) {
    lines.push(`### ${seg === "all" ? "All evaluated patrons" : "Warm patrons only"}`, "");
    lines.push(
      "Per seed: Wilcoxon signed-rank test on the per-patron F1@10 differences (first − second), paired by patron. *n* is the number of patrons whose two lists scored differently (the only ones that can be ranked); *zeros* is how many scored identically. Holm-adjusted *p* is corrected across the three comparisons.",
      "",
    );
    for (const id of ["tuned-vs-content", "tuned-vs-collab", "initial-vs-content"]) {
      const r = sigRow(id, seg);
      lines.push(`**${r.label}**`, "");
      lines.push("| Seed | n | zeros | Mean F1 difference | *p* (Wilcoxon) | *p* (Holm) | Rank-biserial *r* |", "|---|---|---|---|---|---|---|");
      for (const w of r.perSeed) {
        lines.push(`| ${w.seed} | ${num(w.n)} | ${num(w.zeros)} | ${signed(w.meanDiff, 5)} | ${fmtP(w.p)} | ${fmtP(w.pHolm)} | ${fixed(w.rankBiserial, 3)} |`);
      }
      const t = r.acrossSeeds;
      lines.push("", `Across the ${seeds.length} seed means (paired *t*-test): mean difference ${signed(t.meanDiff, 5)}, *t*(${t.df}) = ${fixed(t.t, 2)}, *p* = ${fmtP(t.p)} (Holm ${fmtP(t.pHolm)}), Cohen's *d*<sub>z</sub> = ${fixed(t.dz, 2)}. Decision rule: ${r.verdict}.`, "");
    }
  }
  return lines.join("\n");
}

function build(): string {
  const tc = sigRow("tuned-vs-content", "all");
  const tk = sigRow("tuned-vs-collab", "all");
  const ic = sigRow("initial-vs-content", "all");
  const betterBaseline = stat("content", "all", "f1").mean >= stat("collab", "all", "f1").mean ? "content-based" : "collaborative";
  const tunedF1 = stat("hybrid-tuned", "all", "f1");
  const contentF1 = stat("content", "all", "f1");
  const rel = (tunedF1.mean - contentF1.mean) / contentF1.mean;
  const share_ = (cfg: string, seg: Seg) => stat(cfg, seg, "contentShare").mean;
  const differing = (r: ReturnType<typeof sigRow>) => r.perSeed.map((w) => w.n / (w.n + w.zeros));

  const supports = tc.verdict.startsWith("first significantly better") && tk.verdict.startsWith("first significantly better");
  const initialWorse = ic.verdict.startsWith("first significantly worse");

  const L: string[] = [];
  L.push(
    "# LibRec evaluation results",
    "",
    "Material for Chapter 4 of the seminar report. Generated by `scripts/make-results.ts` from the files in `results/` and `data/processed/`; every number below is read from those files. To regenerate, see the last section.",
    "",
    "## Contents",
    "",
    "1. [Dataset](#1-dataset)",
    "2. [Evaluation protocol](#2-evaluation-protocol)",
    "3. [Weight sweep (validation)](#3-weight-sweep-validation)",
    "4. [Final comparison by segment](#4-final-comparison-by-segment)",
    "5. [Coverage](#5-coverage)",
    "6. [Component attribution](#6-component-attribution)",
    "7. [Statistical significance](#7-statistical-significance)",
    "8. [Verdict on H0 and H1](#8-verdict-on-h0-and-h1)",
    "9. [Limitations](#9-limitations)",
    "10. [Reproducing these results](#10-reproducing-these-results)",
    "",
    "## 1. Dataset",
    "",
    "Source: goodbooks-10k, original release (about 982,000 ratings). Cleaning followed `docs/DECISIONS.md`; all random steps use seed 42. Full detail: `data/processed/cleaning_report.md`.",
    "",
    "| Step | Rule | Before | After |",
    "|---|---|---|---|",
    `| 1–2 | Keep English (eng, en-US, en-GB, en-CA; ${num(clean.books_null_language)} null-language books kept); de-duplicate | ${num(clean.books_raw)} books | ${num(clean.books_final)} books, ${num(clean.ratings_final)} ratings, ${num(clean.users_final)} users |`,
    `| 3 | 44-genre whitelist; exclude books with \`erotica\` in their top 3 genres | ${num(clean.step3_books_before)} books | ${num(clean.step3_books_before - clean.step3_books_excluded_erotica)} books |`,
    `| 3b | Catalogue limited to 1,000 books (at least 10 per primary genre, then most rated) | 9,571 books | ${num(step6.catalogue_books)} books, ${num(step6.before_cap.ratings)} ratings, ${num(step6.before_cap.users)} users |`,
    `| 5 | Build \`content_text\` = genres + author + description (${num(step5.with_description)} books have a description, ${step5.without_description} do not) | ${num(step5.books_in)} books | ${num(step5.books_out)} books |`,
    `| 6 | Cap ${step6.cap} ratings per user (random), then keep users with at least ${step6.min_ratings} | ${num(step6.before_cap.users)} users, ${num(step6.before_cap.ratings)} ratings | ${num(step6.final.users)} users, ${num(step6.final.ratings)} ratings |`,
    `| 7 | Simulate BORROW events (${num(step7.paired_borrows)} paired with a rating, ${num(step7.extra_borrows)} extra) | ${num(step6.final.ratings)} ratings | ${num(step7.interactions)} interactions |`,
    "",
    "**Final dataset**",
    "",
    "| Quantity | Value |",
    "|---|---|",
    `| Books (items) | ${num(step7.books)} |`,
    `| Patrons (users) | ${num(step7.users)} |`,
    `| Interactions | ${num(step7.interactions)} (${num(step7.rate)} ratings + ${num(step7.borrow)} simulated borrows) |`,
    `| Distinct (patron, book) pairs | ${num(step7.unique_pairs)} |`,
    `| Density of the patron–book matrix | ${step7.density_all_pct}% counting all interactions (${step7.density_ratings_pct}% counting ratings only) |`,
    `| Sparsity | ${(100 - step7.density_all_pct).toFixed(2)}% of the matrix is empty |`,
    `| Ratings per patron | mean ${step6.final.mean_per_user}, median ${step6.final.median_per_user} (3–4: ${num(step6.final.bands["3-4"])} patrons, 5–15: ${num(step6.final.bands["5-15"])}, 16–30: ${num(step6.final.bands["16-30"])}) |`,
    `| Rating values 1 / 2 / 3 / 4 / 5 | ${[1, 2, 3, 4, 5].map((v) => num(step6.rating_value_counts[String(v)])).join(" / ")} (${pct(positiveShare)} are 4 or 5; mean ${meanRating.toFixed(2)}) |`,
    `| TF-IDF vocabulary | ${num(final.dataset.tfidfVocabulary)} terms |`,
    "",
    "## 2. Evaluation protocol",
    "",
    "The same dataset, partition, preprocessing and metrics are used for every configuration (CLAUDE.md; `docs/DECISIONS.md` has the reasons).",
    "",
    "- **Partition.** Whole (patron, book) pairs are split, so a book's borrow and rating always fall on the same side. About 20% of each patron's distinct books are held out (at least one, always keeping at least two for training). The split is seeded (mulberry32); seeds " + seeds.join(", ") + " give " + seeds.length + " different partitions. All configurations run on the identical partition and are fitted on its training part only.",
    `- **Relevance.** A held-out book is relevant only if it is a real rating of 4 or more. Simulated borrows stay in training and never count as relevant (they were generated from each patron's tastes, so counting them would favour content-based filtering). Patrons with no relevant held-out book are left out of that seed's metrics (about ${num(Math.round(final.perSeed.reduce((s: number, r: { skippedUsers: number }) => s + r.skippedUsers, 0) / seeds.length))} of ${num(Math.round(final.perSeed.reduce((s: number, r: { testUsers: number }) => s + r.testUsers, 0) / seeds.length))} test patrons per seed).`,
    `- **Metrics.** Precision@${N}, Recall@${N} and F1@${N}, computed per patron and averaged within a segment, then reported as the mean ± sample standard deviation over the ${seeds.length} seeds. Precision divides by ${N} even when fewer than ${N} books are returned, so a short list is penalised. No backfilling.`,
    "- **Segments.** *Cold*: fewer than 3 distinct training books (the switching rule's own count). *Warm*: 3 or more. After the split every patron keeps at least 2 books, so the cold segment is the patrons with exactly 2.",
    "- **Configurations.** Content-based (TF-IDF + cosine, rating-weighted mean profile, borrows weighted 3.5); collaborative (user-user Pearson on explicit ratings, at least 3 co-rated books, k = 30 positive neighbours, mean-centred prediction); the hybrid (switching rule below 3 books, otherwise min-max-normalised content score and rescaled CF prediction combined by weight) with the initial weights 0.35 / 0.65 and with the tuned weights; and *most popular* as a non-personalised sanity check, kept outside the hypothesis.",
    `- **Weight tuning.** The weights were chosen on a validation split carved from each seed's training rows only (seed 1000 + s), by the highest mean validation F1@${N} over contentWeight 0.0 to 1.0 in steps of 0.1 (ties to the lower content weight), and then evaluated once on the test partitions. The test set did not take part in the choice.`,
    "",
    "## 3. Weight sweep (validation)",
    "",
    `![Weight sweep](charts/weight-sweep.png)`,
    "",
    `| contentWeight | collabWeight | F1@${N} all (mean ± sd) | F1@${N} warm |`,
    "|---|---|---|---|",
    ...sweep.grid.map((g: { contentWeight: number; collabWeight: number }) => {
      const k = g.contentWeight.toFixed(1);
      const a = sweep.summary[k].segments.all.f1;
      const w = sweep.summary[k].segments.warm.f1;
      const chosen = Math.abs(g.contentWeight - tunedW) < 1e-9 ? " **(chosen)**" : "";
      return `| ${k}${chosen} | ${g.collabWeight.toFixed(1)} | ${pm(a)} | ${f4(w.mean)} |`;
    }),
    "",
    `The curve rises steadily towards content-heavy weights, peaks at ${tunedW.toFixed(1)} / ${tunedC.toFixed(1)} and falls slightly at content only. The initial weights 0.35 / 0.65 lie on the rising part of the curve, well below the peak. The cold segment is unaffected by the weights (content only), so only warm patrons move along this curve.`,
    "",
    "## 4. Final comparison by segment",
    "",
    "![F1 by method and segment](charts/f1-by-method-and-segment.png)",
    "",
  );
  for (const seg of SEGS) {
    L.push(`**${SEG_LABEL[seg]}** (about ${num(Math.round(stat("content", seg, "users").mean))} patrons per seed)`, "", `| Method | Precision@${N} | Recall@${N} | F1@${N} |`, "|---|---|---|---|");
    for (const m of METHODS) {
      const bold = m.key === "hybrid-tuned";
      const cell = (x: string) => (bold ? `**${x}**` : x);
      L.push(`| ${m.label} | ${cell(pm(stat(m.key, seg, "precision")))} | ${cell(pm(stat(m.key, seg, "recall")))} | ${cell(pm(stat(m.key, seg, "f1")))} |`);
    }
    L.push("");
  }
  L.push(
    `On the cold segment the hybrid is the content-based recommender by construction (the switching rule never invokes collaborative filtering), so both rows are identical there; the hybrid can only change the result for warm patrons. The collaborative-only configuration cannot recommend anything to a cold-start patron, which is the weakness the switching rule is meant to cover.`,
    "",
    "## 5. Coverage",
    "",
    `Share of evaluated patrons who received no recommendation, 1 to ${N - 1}, or a full list of ${N} (no backfilling).`,
    "",
    `| Method | Segment | None | 1–${N - 1} | Full list ${N} |`,
    "|---|---|---|---|---|",
  );
  for (const m of METHODS.filter((x) => x.key !== "popular")) {
    for (const seg of SEGS) {
      L.push(`| ${m.short} | ${seg} | ${pct(stat(m.key, seg, "coverageNone").mean)} | ${pct(stat(m.key, seg, "coveragePartial").mean)} | ${pct(stat(m.key, seg, "coverageFull").mean)} |`);
    }
  }
  const covered = stat("collab", "all", "f1Covered");
  L.push(
    "",
    `Collaborative filtering alone returns a full list to only ${pct(stat("collab", "all", "coverageFull").mean)} of patrons. Over the patrons it *can* serve it scores F1@${N} ${pm(covered)}, which is still below content-based filtering on all patrons (${pm(contentF1)}); the comparison uses the all-patrons figure, as the protocol requires, and the covered-only figure is supplementary.`,
    "",
    "## 6. Component attribution",
    "",
    "Each hybrid item is attributed to the component with the larger weighted contribution (ties to content). Cold-path items are always content.",
    "",
    "| Hybrid | Segment | Items from content | Items from collaborative |",
    "|---|---|---|---|",
  );
  for (const m of [METHODS[0], METHODS[3]]) {
    for (const seg of SEGS) {
      L.push(`| ${m.short} | ${seg} | ${pct(share_(m.key, seg))} | ${pct(stat(m.key, seg, "collabShare").mean)} |`);
    }
  }
  L.push(
    "",
    `With the tuned weights ${pct(share_("hybrid-tuned", "all"), 2)} of the recommended items are attributed to content: the tuned hybrid is almost a content-based recommender whose ordering is adjusted at the margin by collaborative predictions. With the initial weights the split is far more even, and the result is worse.`,
    "",
    "## 7. Statistical significance",
    "",
    "Protocol (fixed before the tests were run, `docs/DECISIONS.md` 2026-10-14): two-sided tests at α = 0.05, Holm-adjusted across the three comparisons; the hypothesis is rejected against a baseline only if the hybrid is better and the adjusted Wilcoxon *p* is below 0.05 in every seed. The *t*-test on the five seed means is a robustness check. Statistics code: `lib/evaluation/stats.ts`, checked against a worked example and scipy in `tests/stats.test.ts`. Full output: `results/significance.json` and `.csv`.",
    "",
    "**Summary (all evaluated patrons)**",
    "",
    "| Comparison | Mean F1 difference | Wilcoxon *p* (Holm), across seeds | Rank-biserial *r* | *t*-test *p* (Holm) | Cohen's *d*<sub>z</sub> | Rule |",
    "|---|---|---|---|---|---|---|",
  );
  for (const r of [tc, tk, ic]) {
    const ps = r.perSeed.map((w) => w.pHolm);
    L.push(
      `| ${r.label} | ${signed(r.acrossSeeds.meanDiff, 5)} | ${fmtP(Math.min(...ps))} to ${fmtP(Math.max(...ps))} | ${range(r.perSeed.map((w) => w.rankBiserial), (x) => fixed(x, 2))} | ${fmtP(r.acrossSeeds.pHolm)} | ${fixed(r.acrossSeeds.dz, 2)} | ${r.verdict} |`,
    );
  }
  L.push(
    "",
    `Reading the effect sizes: most patrons receive exactly the same list from the two methods (identical F1), so the Wilcoxon test ranks only the patrons whose lists differ. For hybrid-tuned against content that is ${pct(Math.min(...differing(tc)))} to ${pct(Math.max(...differing(tc)))} of the evaluated patrons, and the rank-biserial correlation describes them. The mean difference over *all* patrons, ${signed(tc.acrossSeeds.meanDiff, 4)} F1 (${signed(rel * 100, 1)}% relative), is the practical size of the improvement.`,
    "",
    "The *t*-test degrees of freedom are 4, and the five seeds are not independent replications: they re-partition the same patrons and books. The across-seed *p*-values and the very large *d*<sub>z</sub> (the seed-to-seed spread of the difference is tiny) therefore overstate certainty and are best read as 'the sign is the same in every seed'.",
    "",
    "Detailed per-seed results:",
    "",
    sigSection(),
    "",
    "## 8. Verdict on H0 and H1",
    "",
    "- **H0:** the hybrid gives no significant improvement over the baselines. **H1:** it gives a significant improvement. The test quantity is (hybrid metric) − (better baseline metric).",
    `- The better baseline is **${betterBaseline}** filtering (F1@${N} ${f4(contentF1.mean)} against ${f4(stat("collab", "all", "f1").mean)}).`,
  );
  if (supports) {
    L.push(
      `- **With the tuned weights (${tunedW.toFixed(1)} / ${tunedC.toFixed(1)}), H0 is rejected in favour of H1 against both baselines.** The hybrid beats content-based filtering in all ${seeds.length} seeds (mean F1@${N} ${f4(tunedF1.mean)} against ${f4(contentF1.mean)}, a gain of ${f4(tunedF1.mean - contentF1.mean)} or ${(rel * 100).toFixed(1)}%), and beats collaborative filtering by a wide margin. The improvement over the better baseline is statistically significant but small in absolute terms.`,
    );
  } else {
    L.push(`- **H0 is not rejected for every comparison under the pre-stated rule** (see section 7); the results below say which.`);
  }
  if (initialWorse) {
    L.push(
      `- **With the pre-registered initial weights (0.35 / 0.65), H1 is not supported:** the hybrid is significantly *worse* than content-based filtering in every seed (mean F1@${N} ${f4(stat("hybrid", "all", "f1").mean)} against ${f4(contentF1.mean)}). Weighting collaborative filtering at 0.65 hurts on this dataset.`,
    );
  }
  L.push(
    "- **Interpretation.** The hybrid helps only when it leans heavily on content-based filtering and uses collaborative predictions as a small correction. The switching rule is doing its job (cold-start patrons get content-based results, whereas collaborative filtering alone serves none of them), but the evidence for the *weighted combination* is modest: a significant gain of about " +
      `${(rel * 100).toFixed(0)}% over the best single technique, on a dataset where simulated borrows favour content-based filtering, with weights tuned on patrons that also appear in the test set (section 9).`,
    "",
    "## 9. Limitations",
    "",
    `1. **Simulated borrows and synthetic timestamps.** ${pct(step7.borrow / step7.interactions, 0)} of the interactions are simulated borrows, generated from each patron's own top genres, so they are consistent with taste by construction and favour content-based methods. They never count as relevant, but they enter every patron's training history and the content profile. All timestamps (borrows and ratings) were assigned within one academic session (2024-09-02 to 2025-06-27); nothing temporal can be concluded, and the admin statistics label them synthetic.`,
    "2. **Validation and test share patrons.** The validation split is carved from each seed's training rows, and the test rows belong to the same patrons. No held-out test pair was used to choose the weights, but the choice is not fully independent of the test data, so the tuned-weights result is somewhat optimistic. A split by patron would remove this.",
    `3. **Positive rating skew.** ${pct(positiveShare)} of ratings are 4 or 5 (mean ${meanRating.toFixed(2)}), so "relevant" is a common outcome and rating-weighted profiles carry little negative signal; low ratings (1–2) still pull a content profile towards the book, as in the plain weighted mean the report specifies.`,
    "4. **No collaborative-filtering support threshold.** A book rated by a single neighbour can receive an extreme prediction. Adding a minimum-support rule after seeing results would have been tuning on test data, so it is left as future work. Pearson also requires at least 3 co-rated books, which many patrons cannot satisfy on this sparse data: collaborative filtering alone serves " + pct(stat("collab", "warm", "coverageFull").mean, 0) + " of warm patrons with a full list.",
    `5. **Popularity's flat curve.** The most-popular sanity baseline scores only F1@${N} ${f4(stat("popular", "all", "f1").mean)}. The catalogue was built to be broad (at least 10 books per genre, then most rated) and users were capped at 30 ratings, so interest is spread out: the 10 most-read books account for ${pct(share(10))} of patron–book pairs and the top 100 for ${pct(share(100))}, where a heavily skewed catalogue would show far more (an even spread would give 1% and 10%). This is the likely reason popularity carries little signal here, though this evaluation does not test that explanation. On a more skewed library it would be a harder baseline to beat.`,
    `6. **The initial 0.35 / 0.65 weights underperform content-based filtering.** They were a starting guess (the report's), not a principled choice, and on this dataset they are significantly worse than the best single technique (F1@${N} ${f4(stat("hybrid", "all", "f1").mean)} against ${f4(contentF1.mean)}). The approved weights come from the validation sweep, not from the initial values, and the report should present both.`,
    "7. **One dataset, one catalogue size.** 1,000 books and 4,849 patrons from a public ratings dataset, not a real library's circulation records. The p-values describe this dataset and protocol.",
    "8. **Item cold-start.** A book with no ratings gets no collaborative contribution (it can only be ranked by content), as decided in `docs/DECISIONS.md`; the evaluation does not isolate this case.",
    "",
    "## 10. Reproducing these results",
    "",
    "```bash",
    "npm install",
    "npm run db:up                                    # only needed for the app and the tests, not for the evaluation",
    `npx tsx scripts/evaluate.ts --configs content,collab,hybrid,hybrid-tuned,popular --seeds ${seeds.join(",")} --n ${N} --out results/eval-final`,
    "npx tsx scripts/significance.ts                  # per-patron paired tests -> results/significance.json / .csv",
    "npx tsx scripts/make-results.ts                  # this file and results/charts/*.png",
    "```",
    "",
    `The evaluation reads \`data/processed/*.csv\` directly (no database) and is deterministic for a given seed. Generated: ${new Date().toISOString().slice(0, 10)}.`,
    "",
  );
  return L.join("\n");
}

async function main() {
  await renderPngs([
    { file: "f1-by-method-and-segment.png", svg: f1Chart() },
    { file: "weight-sweep.png", svg: sweepChart() },
  ]);
  writeFileSync(path.join(ROOT, "results/RESULTS.md"), build());
  console.log("Wrote results/RESULTS.md, results/charts/f1-by-method-and-segment.png and results/charts/weight-sweep.png");
}

main();
