// Scores Jev search matching (lib/resolve.ts) on queries generated from the live roster.
// Usage: npm run eval:search [-- --compare]
//   --compare  also runs a small sample end to end through today's Claude search and through
//              Jev + Claude dossier, for accuracy and time side by side (spends Claude credits).
// Results: scripts/fixtures/jev-eval.json (gitignored: it contains client names).
import { mkdirSync, writeFileSync } from "node:fs";
import { getAccountIndex, type IndexedAccount } from "../lib/accountIndex";
import { norm, resolveQuery, T, type Resolution } from "../lib/resolve";
import { runLookup } from "../lib/claude";
import { JEV_MODEL } from "../lib/jev";

type Case = { type: string; query: string; expect: string[] | "none" };
type Outcome = "direct" | "listed" | "did_you_mean" | "missed" | "WRONG" | "rejected" | "soft" | "error";

const STOP = new Set(["insurance", "agency", "agencies", "group", "the", "and", "inc", "llc", "services", "financial", "company", "co"]);
const PERSONAL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com", "msn.com", "live.com", "comcast.net"]);
const JUNK = [
  "asdf",
  "qwerty",
  "CPA report",
  "how many leads did we get last month",
  "renewal date",
  "Zebra Pet Grooming",
  "Lakeside Dental",
  "Acme Widgets LLC",
  "pizza",
  "Microsoft",
];

const wordsOf = (s: string) => norm(s).split(/[\s@.-]+/).filter(Boolean);

function typos(s: string): string[] {
  const chars = [...s];
  const letters = chars.map((c, i) => (/[a-z]/i.test(c) ? i : -1)).filter((i) => i > 0);
  if (letters.length < 5) return [];
  const at = (f: number) => letters[Math.floor(letters.length * f)];
  const drop = chars.filter((_, i) => i !== at(0.5)).join("");
  const i = at(0.33);
  const swap = chars.map((c, k) => (k === i ? chars[i + 1] : k === i + 1 ? chars[i] : c)).join("");
  const j = at(0.75);
  const dbl = chars.slice(0, j + 1).join("") + chars[j] + chars.slice(j + 1).join("");
  return [drop, swap, dbl].filter((t) => norm(t) !== norm(s));
}

function buildCases(index: IndexedAccount[]): Case[] {
  const cases: Case[] = [];
  const add = (type: string, query: string, expect: string[] | "none") => {
    if (query.trim() && !cases.some((c) => c.query === query)) cases.push({ type, query, expect });
  };
  const withTitleWord = (w: string) => index.filter((a) => wordsOf(a.name).includes(w)).map((a) => a.id);

  for (const a of index) {
    add("name", a.name, [a.id]);
    add("name_lower", a.name.toLowerCase(), [a.id]);
    for (const t of typos(a.name)) add("name_typo", t, [a.id]);
    const distinctive = wordsOf(a.name).filter((w) => !STOP.has(w) && w.length >= 3);
    if (distinctive[0]) add("first_word", distinctive[0], withTitleWord(distinctive[0]));
    const partial = distinctive.join(" ");
    if (distinctive.length > 1 && partial !== norm(a.name)) add("partial", partial, [a.id]);
    for (const alias of a.aliases) {
      add("alias", alias, [a.id]);
      for (const t of typos(alias).slice(0, 1)) add("alias_typo", t, [a.id]);
    }
    for (const c of a.contacts) {
      const holders = index.filter((x) => x.contacts.some((y) => norm(y.name) === norm(c.name))).map((x) => x.id);
      add("contact", c.name, holders);
      const last = c.name.split(/\s+/).slice(1).join(" ");
      for (const t of typos(last).slice(0, 1)) add("contact_typo", c.name.replace(last, t), holders);
      const first = c.name.split(/\s+/)[0];
      if (first.length >= 3) {
        const sameFirst = index.filter((x) => x.contacts.some((y) => norm(y.name.split(/\s+/)[0]) === norm(first))).map((x) => x.id);
        add("first_name", first, sameFirst);
      }
      if (c.email) {
        add("email", c.email, index.filter((x) => x.contacts.some((y) => y.email === c.email)).map((x) => x.id));
        const domain = c.email.split("@")[1];
        if (domain && !PERSONAL.has(domain)) {
          add("email_domain", domain, index.filter((x) => x.contacts.some((y) => y.email?.endsWith("@" + domain))).map((x) => x.id));
        }
      }
    }
  }
  for (const j of JUNK) add("junk", j, "none");
  return cases;
}

function score(c: Case, r: Resolution | null): Outcome {
  if (!r) return "error";
  if (c.expect === "none") return r.kind === "not_found" ? "rejected" : r.kind === "candidates" ? "soft" : "WRONG";
  const ok = c.expect;
  if (r.kind === "account") return ok.includes(r.account.id) ? "direct" : "WRONG";
  if (r.kind === "candidates") return r.result.candidates.some((x) => ok.includes(x.accountId)) ? "listed" : "missed";
  return r.result.didYouMean && ok.includes(r.result.didYouMean.accountId) ? "did_you_mean" : "missed";
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

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "—");
const quantile = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0);

async function main() {
  if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY missing from .env.local");
  const compare = process.argv.includes("--compare");

  // Collect Jev's own timing and token lines instead of printing hundreds of them.
  const jevCalls: { ms: number; tokens: number }[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    const m = typeof args[0] === "string" && args[0].match(/^\[jev\] [\w-]+: [^,]+, (\d+)ms, (\d+|\?) input tokens/);
    if (m) jevCalls.push({ ms: Number(m[1]), tokens: Number(m[2]) || 0 });
    else log(...args);
  };

  const index = await getAccountIndex();
  const cases = buildCases(index);
  log(`Model ${JEV_MODEL}. ${index.length} accounts, ${cases.length} queries. Thresholds ${JSON.stringify(T)}\n`);

  const results = await pool(cases, 4, async (c) => {
    const t0 = Date.now();
    const r = await resolveQuery(c.query);
    return { ...c, outcome: score(c, r), ms: Date.now() - t0, route: r?.kind ?? "error", via: r?.kind === "account" ? r.via : undefined, top: r?.top, got: r?.kind === "account" ? r.account.name : r?.kind === "candidates" ? r.result.candidates.map((x) => x.accountName) : r?.kind === "not_found" ? r.result.didYouMean?.accountName ?? null : null };
  });

  const types = [...new Set(results.map((r) => r.type))];
  log("type           n   direct  listed  did-you-mean  missed  WRONG   (junk: rejected / soft)");
  for (const t of types) {
    const rs = results.filter((r) => r.type === t);
    const n = (o: Outcome) => rs.filter((r) => r.outcome === o).length;
    const line =
      t === "junk"
        ? `${pct(n("rejected"), rs.length)} rejected, ${n("soft")} soft, ${n("WRONG")} WRONG`
        : `${pct(n("direct"), rs.length).padStart(6)}  ${String(n("listed")).padStart(6)}  ${String(n("did_you_mean")).padStart(12)}  ${String(n("missed")).padStart(6)}  ${String(n("WRONG")).padStart(5)}${n("error") ? `  errors ${n("error")}` : ""}`;
    log(`${t.padEnd(13)} ${String(rs.length).padStart(3)}   ${line}`);
  }

  const single = results.filter((r) => r.expect !== "none" && r.expect.length === 1 && ["name", "name_lower", "name_typo", "partial", "alias", "alias_typo", "contact", "contact_typo", "email"].includes(r.type));
  const wrong = results.filter((r) => r.outcome === "WRONG");
  const nonJunkMissed = results.filter((r) => r.expect !== "none" && (r.outcome === "missed" || r.outcome === "error"));
  const jevMs = jevCalls.map((c) => c.ms);
  const caseMs = results.filter((r) => r.via !== "exact").map((r) => r.ms);
  const tokens = jevCalls.reduce((n, c) => n + c.tokens, 0);

  log(`\nConfidently wrong: ${wrong.length}  (must be 0)`);
  log(`Clear single-account queries opened directly: ${pct(single.filter((r) => r.outcome === "direct").length, single.length)} of ${single.length}  (target ≥ 95%)`);
  log(`Non-junk queries where the right account wasn't offered at all: ${nonJunkMissed.length}`);
  log(`Jev calls ${jevCalls.length}: p50 ${quantile(jevMs, 0.5)} ms, p95 ${quantile(jevMs, 0.95)} ms. Per query (non-exact, incl. roster cache): p50 ${quantile(caseMs, 0.5)} ms, p95 ${quantile(caseMs, 0.95)} ms`);
  log(`Tokens ${tokens} (≈ $${((tokens / 1e6) * 0.042).toFixed(4)} at $0.042/Mtok), ${(tokens / Math.max(1, jevCalls.length)).toFixed(0)} per call`);

  const show = (r: (typeof results)[number]) => `  [${r.type}] ${JSON.stringify(r.query)} → ${r.route}${r.got ? ` ${JSON.stringify(r.got)}` : ""}${r.top !== undefined ? ` (top ${r.top.toFixed(2)})` : ""}`;
  if (wrong.length) log("\nConfidently wrong:\n" + wrong.map(show).join("\n"));
  if (nonJunkMissed.length) log("\nMissed:\n" + nonJunkMissed.map(show).join("\n"));
  const notDirect = single.filter((r) => r.outcome !== "direct" && r.outcome !== "WRONG" && r.outcome !== "missed");
  if (notDirect.length) log("\nClear queries that didn't open directly:\n" + notDirect.map(show).join("\n"));
  const soft = results.filter((r) => r.outcome === "soft");
  if (soft.length) log("\nJunk that got candidates:\n" + soft.map(show).join("\n"));

  let comparison: unknown = null;
  if (compare) {
    // A spread of query types, run end to end both ways.
    const pick = (t: string, k: number) => results.filter((r) => r.type === t).slice(0, k);
    const sample = [...pick("name_typo", 2), ...pick("first_word", 1), ...pick("alias", 1), ...pick("contact_typo", 1), ...pick("first_name", 1), ...pick("junk", 2)];
    log(`\nComparing ${sample.length} queries end to end (Claude today vs Jev + Claude dossier)…`);
    comparison = await pool(sample, 2, async (c) => {
      const t0 = Date.now();
      const old = await runLookup({ query: c.query }).catch((e) => ({ error: (e as Error).message }));
      const oldMs = Date.now() - t0;
      const t1 = Date.now();
      const r = await resolveQuery(c.query);
      let newKind: string = r?.kind ?? "error";
      if (r?.kind === "account") {
        const d = await runLookup({ query: c.query, accountId: r.account.id }).catch(() => null);
        newKind = d?.response.result.kind ?? "error";
      }
      const newMs = Date.now() - t1;
      const o = "response" in old ? old.response.result : null;
      const oldGot = o?.kind === "dossier" ? o.account.name : o?.kind === "candidates" ? o.candidates.map((x) => x.accountName).join(", ") : o?.kind ?? ("error" in old ? `error: ${old.error}` : "?");
      const row = { query: c.query, type: c.type, claude: { kind: o?.kind ?? "error", got: oldGot, ms: oldMs }, jev: { kind: newKind, got: c.got, ms: newMs } };
      log(`  ${JSON.stringify(c.query).padEnd(28)} Claude: ${row.claude.kind} ${JSON.stringify(oldGot)} ${(oldMs / 1000).toFixed(1)}s | Jev: ${newKind} ${JSON.stringify(c.got)} ${(newMs / 1000).toFixed(1)}s`);
      return row;
    });
  }

  mkdirSync(new URL("./fixtures/", import.meta.url), { recursive: true });
  writeFileSync(new URL("./fixtures/jev-eval.json", import.meta.url), JSON.stringify({ model: JEV_MODEL, thresholds: T, results, comparison }, null, 2));
  log("\nFull results: scripts/fixtures/jev-eval.json");
  process.exit(wrong.length ? 1 : 0);
}

main().catch((e) => {
  console.error("\nEval failed:", e?.message ?? e);
  process.exit(1);
});
