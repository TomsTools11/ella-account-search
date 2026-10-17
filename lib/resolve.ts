import { choice, noul, type ChoiceCriteria } from "@typesafe-ai/sdk";
import { getAccountIndex, type IndexedAccount } from "./accountIndex";
import { askJev } from "./jev";
import type { Candidates, NotFound } from "./schemas";

// Turns what Ella typed into one account, a short candidate list, or "not found":
// exact matches in code first, then one Jev request over the whole roster, routed on its
// probabilities. Returns null when Jev is unavailable so the caller uses the Claude path.

export type Resolution =
  | { kind: "account"; account: IndexedAccount; matchedVia: string; via: "exact" | "jev"; top?: number }
  | { kind: "candidates"; result: Candidates; top: number }
  | { kind: "not_found"; result: NotFound; top: number };

// Starting thresholds; tuned against scripts/jev-search-eval.ts.
export const T = {
  direct: 0.85, // open the dossier when the matched account's probability is at least this
  confirmFrom: 0.3, // below `direct` but at least this: ask a per-candidate yes/no to confirm
  confirmYes: 0.85,
  confirmOthersMax: 0.2,
  candidate: 0.1, // list an account as a candidate at this probability
  didYouMean: 0.15,
  notALookup: 0.3,
};

const NONE = "none of these";

export const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (s: string) => norm(s).split(/[\s@.-]+/).filter((w) => w.length >= 3);

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/** True when any word of the query is (nearly) a word of the text. */
function resembles(query: string, text: string): boolean {
  const q = words(query);
  return words(text).some((w) => q.some((x) => x === w || (x.length >= 4 && w.length >= 4 && editDistance(x, w) <= 1)));
}

/** A few words on why an account matched, for the dossier and candidate list. */
export function reasonFor(a: IndexedAccount, query: string): string {
  const q = norm(query);
  const domainOf = (e: string) => e.split("@")[1];
  const byEmail = a.contacts.find((c) => c.email && (c.email === q || q.replace(/^.*@/, "") === domainOf(c.email)));
  if (byEmail) return `contact ${byEmail.name}${byEmail.role ? `, ${byEmail.role}` : ""} (email)`;
  if (resembles(query, a.name)) return "account name";
  const alias = a.aliases.find((x) => resembles(query, x));
  if (alias) return `alias ${alias}`;
  const contact = a.contacts.find((c) => resembles(query, c.name));
  if (contact) return `contact ${contact.name}${contact.role ? `, ${contact.role}` : ""}`;
  return "closest account name";
}

/** Exact matches in code, strongest signal first. Returns the matching accounts, or null. */
function exactMatch(index: IndexedAccount[], query: string): { accounts: IndexedAccount[]; via: string } | null {
  const q = norm(query);
  const tiers: [string, (a: IndexedAccount) => string | null][] = [
    ["contact email", (a) => a.contacts.find((c) => c.email === q)?.name ?? null],
    ["alias", (a) => a.aliases.find((x) => norm(x) === q) ?? null],
    ["account name", (a) => (norm(a.name) === q ? a.name : null)],
    ["contact", (a) => a.contacts.find((c) => norm(c.name) === q)?.name ?? null],
    // A bare domain ("allstate.com" or "@allstate.com"): every account with a contact there.
    ["email domain", (a) => (/^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(q) ? a.contacts.find((c) => c.email?.endsWith("@" + q.replace(/^@/, "")))?.email?.split("@")[1] ?? null : null)],
  ];
  for (const [via, test] of tiers) {
    const hits = index.map((a) => [a, test(a)] as const).filter(([, v]) => v);
    if (hits.length) {
      const label = via === "account name" ? via : `${via} ${hits[0][1]}`;
      return { accounts: hits.map(([a]) => a), via: label };
    }
  }
  return null;
}

/** Short option description: aliases and people (name, role, email). */
function describe(a: IndexedAccount) {
  return {
    ...(a.aliases.length ? { aliases: a.aliases } : {}),
    people: a.contacts.map((c) => [c.name, c.role && `(${c.role})`, c.email].filter(Boolean).join(" ")),
  };
}

const MATCH_RULES =
  "`query` was typed into an account search box. It may be the agency's name (possibly misspelled, abbreviated, or only part of it), one of the agency's aliases, the name or first name of one of its people, or an email address of one of its people.";

export async function resolveQuery(query: string, signal?: AbortSignal): Promise<Resolution | null> {
  const index = await getAccountIndex();
  const toCandidates = (list: IndexedAccount[]): Candidates => ({
    kind: "candidates",
    candidates: list.map((a) => ({ accountId: a.id, accountName: a.name, status: a.status, reason: reasonFor(a, query), url: a.url })),
  });

  // 1. Exact matches need no model.
  const exact = exactMatch(index, query);
  if (exact?.accounts.length === 1) return { kind: "account", account: exact.accounts[0], matchedVia: exact.via, via: "exact" };
  if (exact) return { kind: "candidates", result: toCandidates(exact.accounts.slice(0, 5)), top: 1 };

  // 2. One Jev request: the roster as a Choice (in both orders, to catch first-option bias)
  //    plus a check that the query is a name at all.
  const labels = new Map<string, IndexedAccount>();
  for (const a of index) labels.set(labels.has(a.name) ? `${a.name} (${a.id.slice(0, 6)})` : a.name, a);
  const forward: ChoiceCriteria = {};
  const reverse: ChoiceCriteria = {};
  const entries = [...labels.entries()];
  for (const [label, a] of entries) forward[label] = describe(a);
  for (const [label, a] of [...entries].reverse()) reverse[label] = describe(a);
  forward[NONE] = reverse[NONE] = "The query doesn't refer to any of these agencies or their people.";
  const instructions = { question: "Which agency does `query` refer to?", how_to_match: MATCH_RULES };

  const first = await askJev(
    "search",
    { query },
    {
      account: choice(instructions, forward),
      account_reversed: choice(instructions, reverse),
      is_lookup: noul(
        "Is `query` the name of an agency or business, a person's name, an email address, or a nickname, rather than a question, a topic, or a request?",
      ),
    },
    signal,
  );
  if (!first) return null;
  const { account: fwd, account_reversed: rev, is_lookup } = first.answers;

  const p = (label: string) => ((fwd.probabilities[label] ?? 0) + (rev.probabilities[label] ?? 0)) / 2;
  const ranked = entries.map(([label, a]) => ({ label, a, p: p(label) })).sort((x, y) => y.p - x.p);
  const top = ranked[0];
  const none = p(NONE);
  const agree = fwd.choice === rev.choice;

  if (agree && fwd.choice === top.label && top.p >= T.direct) {
    return { kind: "account", account: top.a, matchedVia: reasonFor(top.a, query), via: "jev", top: top.p };
  }

  // 3. Close call: confirm the leading accounts one by one, each with its full record.
  let confirmed: Map<string, number> | null = null;
  if (top.p >= T.confirmFrom && top.p > none) {
    const shortlist = ranked.filter((r) => r.p >= 0.05).slice(0, 3);
    const second = await askJev(
      "search-confirm",
      { query },
      Object.fromEntries(
        shortlist.map((r, i) => [
          `c${i}`,
          noul({ question: "Does `query` refer to `candidate`?", how_to_match: MATCH_RULES, candidate: { name: r.a.name, ...describe(r.a) } }),
        ]),
      ),
      signal,
    );
    if (second) {
      confirmed = new Map(shortlist.map((r, i) => [r.a.id, second.answers[`c${i}`]?.noul ?? 0]));
      const yes = shortlist.filter((r) => (confirmed!.get(r.a.id) ?? 0) >= T.confirmYes);
      const othersLow = shortlist.every((r) => r === yes[0] || (confirmed!.get(r.a.id) ?? 0) <= T.confirmOthersMax);
      if (yes.length === 1 && othersLow) {
        return { kind: "account", account: yes[0].a, matchedVia: reasonFor(yes[0].a, query), via: "jev", top: top.p };
      }
    }
  }

  // 4. Candidates, or not found.
  const listed = ranked.filter((r) => r.p >= T.candidate || (confirmed?.get(r.a.id) ?? 0) >= 0.5).slice(0, 5);
  if (listed.length && none < top.p) return { kind: "candidates", result: toCandidates(listed.map((r) => r.a)), top: top.p };

  const notALookup = is_lookup.noul < T.notALookup;
  return {
    kind: "not_found",
    top: top.p,
    result: {
      kind: "not_found",
      message: notALookup
        ? `"${query}" looks like a question rather than an account name. Try asking it in Ask instead.`
        : `No account matches "${query}".`,
      didYouMean: !notALookup && top.p >= T.didYouMean ? { accountId: top.a.id, accountName: top.a.name } : null,
    },
  };
}
