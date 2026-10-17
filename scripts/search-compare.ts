// Head-to-head: today's Claude search matching vs Jev matching, on a labeled query set.
// Usage: npm run compare:search [-- --repeat 3]
// Cases: scripts/fixtures/compare-cases.json, [{ cat, q, expect: [account names], ambiguous? }]
//   expect [] means "not a client". Kept out of git (client names).
// Claude gets the live search prompt and model. Each run stops as soon as Claude commits to an
// account (its first tool call naming that account's page), so this compares matching only;
// the dossier that follows is built the same way on both paths.
// Results: scripts/fixtures/search-compare.json
import { readFileSync, writeFileSync } from "node:fs";
import { getAccountIndex } from "../lib/accountIndex";
import { resolveQuery } from "../lib/resolve";
import { runLookup } from "../lib/claude";
import { model } from "../lib/config";

type Case = { cat: string; q: string; expect: string[]; ambiguous?: boolean };
type Decision = { kind: "dossier" | "candidates" | "not_found" | "error"; picked: string[]; ms: number; note?: string };
type Grade = "correct" | "asked" | "guessed" | "missed" | "WRONG";

const cases = JSON.parse(readFileSync(new URL("./fixtures/compare-cases.json", import.meta.url), "utf8")) as Case[];
const repeatArg = process.argv.indexOf("--repeat");
const repeats = repeatArg > 0 ? Number(process.argv[repeatArg + 1]) : 1;
// --jev-only: re-run just the Jev side, reusing Claude's decisions from the last full run.
const jevOnly = process.argv.includes("--jev-only");

function grade(c: Case, d: Decision): Grade {
  const ok = (n: string) => c.expect.includes(n);
  if (d.kind === "error") return "missed";
  if (!c.expect.length) return d.kind === "not_found" ? "correct" : d.kind === "candidates" ? "asked" : "WRONG";
  if (d.kind === "dossier") return !ok(d.picked[0]) ? "WRONG" : c.ambiguous ? "guessed" : "correct";
  const hits = d.picked.filter(ok).length;
  if (c.ambiguous) return hits >= 2 ? "correct" : hits ? "asked" : "missed";
  return hits ? "asked" : "missed";
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const index = await getAccountIndex();
  const nameById = new Map(index.map((a) => [a.id, a.name]));
  const usage = { input: 0, output: 0, runs: 0, finishedRuns: 0 };

  async function claude(q: string): Promise<Decision> {
    const t0 = Date.now();
    const ac = new AbortController();
    let chosen: string | null = null;
    try {
      const out = await runLookup({
        query: q,
        signal: ac.signal,
        onToolCall: (_name, input) => {
          if (chosen) return;
          const ids = JSON.stringify(input ?? {}).replace(/-/g, "").match(/[0-9a-f]{32}/g) ?? [];
          const id = ids.find((x) => nameById.has(x));
          if (id) {
            chosen = id;
            ac.abort();
          }
        },
      });
      usage.input += out.usage.input;
      usage.output += out.usage.output;
      usage.finishedRuns++;
      const r = out.response.result;
      const ms = Date.now() - t0;
      if (r.kind === "dossier") return { kind: "dossier", picked: [r.account.name], ms };
      if (r.kind === "candidates") return { kind: "candidates", picked: r.candidates.map((x) => x.accountName), ms };
      return { kind: "not_found", picked: r.didYouMean ? [r.didYouMean.accountName] : [], ms };
    } catch (e) {
      if (chosen) return { kind: "dossier", picked: [nameById.get(chosen)!], ms: Date.now() - t0 };
      return { kind: "error", picked: [], ms: Date.now() - t0, note: (e as Error).message.slice(0, 120) };
    } finally {
      usage.runs++;
    }
  }

  async function jev(q: string): Promise<Decision> {
    const t0 = Date.now();
    const r = await resolveQuery(q);
    const ms = Date.now() - t0;
    if (!r) return { kind: "error", picked: [], ms, note: "Jev unavailable" };
    if (r.kind === "account") return { kind: "dossier", picked: [r.account.name], ms };
    if (r.kind === "candidates") return { kind: "candidates", picked: r.result.candidates.map((x) => x.accountName), ms };
    return { kind: "not_found", picked: r.result.didYouMean ? [r.result.didYouMean.accountName] : [], ms };
  }

  const quiet = console.log;
  console.log = (...a: unknown[]) => {
    if (typeof a[0] === "string" && a[0].startsWith("[jev]")) return;
    quiet(...a);
  };
  const log = quiet;
  log(`Claude model ${model()} vs Jev. ${cases.length} queries × ${repeats} run(s) each.\n`);

  const runs: { c: Case; claude: Decision[]; jev: Decision[] }[] = cases.map((c) => ({ c, claude: [], jev: [] }));
  if (jevOnly) {
    const prev = JSON.parse(readFileSync(new URL("./fixtures/search-compare.json", import.meta.url), "utf8")) as { runs: typeof runs };
    for (const x of runs) x.claude = prev.runs.find((p) => p.c.q === x.c.q)?.claude ?? [];
  }
  for (let r = 0; r < repeats; r++) {
    log(`Run ${r + 1}/${repeats}…`);
    const [cl, jv] = await Promise.all([jevOnly ? Promise.resolve([]) : pool(cases, 4, (c) => claude(c.q)), pool(cases, 4, (c) => jev(c.q))]);
    cl.forEach((d, i) => runs[i].claude.push(d));
    jv.forEach((d, i) => runs[i].jev.push(d));
  }

  // Score on the first run; consistency across runs.
  const grades = (side: "claude" | "jev") => runs.map((x) => grade(x.c, x[side][0]));
  const G: Grade[] = ["correct", "asked", "guessed", "missed", "WRONG"];
  const cats = [...new Set(cases.map((c) => c.cat))];
  const table = (side: "claude" | "jev") => {
    const g = grades(side);
    return Object.fromEntries(G.map((k) => [k, g.filter((x) => x === k).length]));
  };
  log("\nOverall (first run)        correct  asked  guessed  missed  WRONG");
  for (const side of ["claude", "jev"] as const) {
    const t = table(side);
    log(`  ${side.padEnd(24)} ${G.map((k) => String(t[k]).padStart(k.length)).join("  ")}`);
  }
  log("\nBy category (correct+asked = right account reached / total; WRONG count)");
  for (const cat of cats) {
    const idx = runs.map((x, i) => (x.c.cat === cat ? i : -1)).filter((i) => i >= 0);
    const line = (["claude", "jev"] as const).map((side) => {
      const g = idx.map((i) => grade(runs[i].c, runs[i][side][0]));
      const reached = g.filter((x) => x === "correct" || x === "asked" || x === "guessed").length;
      const direct = g.filter((x) => x === "correct").length;
      const wrong = g.filter((x) => x === "WRONG").length;
      return `${side}: ${direct}/${idx.length} direct, ${reached}/${idx.length} reached${wrong ? `, ${wrong} WRONG` : ""}`;
    });
    log(`  ${cat.padEnd(18)} ${line[0].padEnd(42)} ${line[1]}`);
  }

  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const p95 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(0.95 * xs.length))] : 0);
  for (const side of ["claude", "jev"] as const) {
    const ms = runs.flatMap((x) => x[side].filter((d) => d.kind !== "error").map((d) => d.ms));
    log(`\n${side} time to decision: median ${(med(ms) / 1000).toFixed(2)}s, p95 ${(p95(ms) / 1000).toFixed(2)}s`);
  }

  if (repeats > 1) {
    const key = (d: Decision) => `${d.kind}:${[...d.picked].sort().join("|")}`;
    for (const side of ["claude", "jev"] as const) {
      const changed = runs.filter((x) => new Set(x[side].map(key)).size > 1);
      log(`${side}: ${changed.length}/${runs.length} queries gave a different result on a repeat run`);
      for (const x of changed.slice(0, 12)) log(`    ${JSON.stringify(x.c.q)}: ${x[side].map(key).join("  /  ")}`);
    }
  }

  const show = (side: "claude" | "jev", want: Grade[]) =>
    runs
      .filter((x) => want.includes(grade(x.c, x[side][0])))
      .map((x) => `    [${x.c.cat}] ${JSON.stringify(x.c.q)} → ${x[side][0].kind} ${JSON.stringify(x[side][0].picked)}${x[side][0].note ? ` (${x[side][0].note})` : ""}  (want ${JSON.stringify(x.c.expect)})`)
      .join("\n");
  for (const side of ["claude", "jev"] as const) {
    const w = show(side, ["WRONG"]);
    const m = show(side, ["missed"]);
    if (w) log(`\n${side} WRONG:\n${w}`);
    if (m) log(`\n${side} missed:\n${m}`);
  }
  log(`\nClaude usage: ${usage.runs} runs; ${usage.finishedRuns} ran to completion (candidates/not found) using ${usage.input} input + ${usage.output} output tokens.`);

  writeFileSync(new URL("./fixtures/search-compare.json", import.meta.url), JSON.stringify({ model: model(), repeats, runs }, null, 2));
  log("Full results: scripts/fixtures/search-compare.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nCompare failed:", e?.message ?? e);
  process.exit(1);
});
