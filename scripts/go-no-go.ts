// Milestone 1 go/no-go: Claude + Notion MCP (read tools only) returns Willard's dossier.
// Usage: npm run go-no-go [-- "query"]   (default query: "willard")
import { readFileSync } from "node:fs";
import { runLookup } from "../lib/claude";
import { getStoredTokens } from "../lib/notionAuth";
import { ws } from "../lib/config";

const query = process.argv[2] ?? "willard";
const expected = JSON.parse(readFileSync(new URL("./fixtures/willard.expected.json", import.meta.url), "utf8"));
const idOf = (url: string) => url.replace(/-/g, "").match(/[0-9a-f]{32}/)?.[0];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing from .env.local");
  const tokens = await getStoredTokens();
  if (!tokens) throw new Error("Notion not connected. Run: npm run notion:auth");
  console.log(`Notion token expires ${new Date(tokens.expiresAt).toLocaleString()}`);
  console.log(`Model: ${process.env.MODEL || "claude-sonnet-5-5"}  Query: ${JSON.stringify(query)}\n`);

  const t0 = Date.now();
  const out = await runLookup({
    query,
    onProgress: (m) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`),
  });

  console.log(`\nDone in ${(out.totalMs / 1000).toFixed(1)}s, ${out.toolCalls.length} tool calls, tokens in/out/cache-read ${out.usage.input}/${out.usage.output}/${out.usage.cacheRead}`);
  for (const c of out.toolCalls) {
    console.log(`  ${(c.atMs / 1000).toFixed(1)}s ${c.name}${c.isError ? `  ERROR: ${c.errorText}` : ""}`);
  }
  console.log("\n" + JSON.stringify(out.response, null, 2));

  // Read-only check: every tool Claude called must be on the allowlist.
  const illegal = out.toolCalls.filter((c) => !ws.notionTools.includes(c.name));
  const checks: [string, boolean][] = [["only allowlisted tools used", illegal.length === 0]];

  if (query === "willard") {
    const r = out.response.result;
    const isDossier = r.kind === "dossier";
    checks.push(["returned a dossier", isDossier]);
    if (r.kind === "dossier") {
      const e = expected;
      const c = r.contacts[0];
      checks.push(
        ["account id", r.account.id === e.account.id],
        ["name", r.account.name === e.account.name],
        ["status", r.account.status === e.account.status],
        ["carrier", r.account.carrier === e.account.carrier],
        ["state", r.account.state === e.account.state],
        ["campaigns", JSON.stringify(r.account.campaigns) === JSON.stringify(e.account.campaigns)],
        ["reporting site", r.account.reportingSite === e.account.reportingSite],
        ["account url → id", idOf(r.account.url) === e.account.id],
        ["1 contact", r.contacts.length === 1],
        ["contact name/role/email/phone", !!c && c.name === e.contacts[0].name && c.role === e.contacts[0].role && c.email === e.contacts[0].email && c.phone === e.contacts[0].phone],
        ["contact url", !!c && idOf(c.url) === e.contacts[0].id],
        ["latest meeting id", idOf(r.latestMeeting?.url ?? "") === e.latestMeeting.id],
        ["latest meeting type", r.latestMeeting?.type === e.latestMeeting.type],
        ["latest meeting date", (r.latestMeeting?.date ?? "").startsWith(e.latestMeeting.dateStart)],
        ["meeting summary unavailable → fallback", r.latestMeeting?.summaryAvailable === false],
        ["0 notes (archived + Daily Brief excluded)", r.recentNotes.length === e.recentNoteCount],
        ["0 projects", r.projects.length === e.projectCount],
      );
    }
  }

  console.log("\nChecks:");
  for (const [name, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("\nGo/no-go failed:", e?.message ?? e);
  process.exit(1);
});
