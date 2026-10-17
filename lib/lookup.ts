import { runLookup } from "./claude";
import { getCachedDossier, getCachedQuery, setCachedDossier, setCachedQuery } from "./cache";
import { NotionAuthError } from "./notionAuth";
import { jevSearchOn } from "./jev";
import { resolveQuery } from "./resolve";
import type { SearchResponse } from "./schemas";

// Events streamed to the browser while a lookup runs.
export type LookupEvent =
  | { type: "progress"; message: string }
  | { type: "result"; response: SearchResponse; pulledAt: number; cached: boolean; ms: number }
  | { type: "error"; kind: "auth" | "other"; message: string };

const idRe = /^[0-9a-f]{32}$/;

export async function lookup(
  input: { query?: string; accountId?: string; refresh?: boolean },
  emit: (e: LookupEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  const query = (input.query ?? "").trim();
  let accountId = input.accountId?.replace(/-/g, "").toLowerCase();
  if (accountId && !idRe.test(accountId)) {
    emit({ type: "error", kind: "other", message: "That isn't a valid account link." });
    return;
  }
  if (!accountId && !query) {
    emit({ type: "error", kind: "other", message: "Type something to search for." });
    return;
  }

  try {
    let matchedVia: string | undefined;
    if (!accountId && !input.refresh) {
      const q = await getCachedQuery(query);
      if (q) ({ accountId, matchedVia } = q);
    }
    // Match the query to an account with Jev (JEV_SEARCH=1). Candidates and "not found" are
    // answered here without Claude; a match skips Claude's matching round. If Jev is
    // unavailable, resolveQuery returns null and Claude matches as before.
    if (!accountId && query && jevSearchOn()) {
      emit({ type: "progress", message: "Matching the account" });
      const r = await resolveQuery(query, signal).catch((e) => {
        if (e instanceof NotionAuthError) throw e;
        console.warn("[lookup] Jev matching failed, using Claude:", (e as Error).message);
        return null;
      });
      if (r) {
        const route = r.kind === "account" ? `${r.via} → ${r.account.name}` : r.kind;
        console.log(`[lookup] ${JSON.stringify(query)} matched by Jev: ${route}${r.kind === "account" && r.via === "exact" ? "" : `, top ${r.top?.toFixed(2)}`} in ${Date.now() - started}ms`);
      }
      if (r?.kind === "account") {
        accountId = r.account.id;
        matchedVia = r.matchedVia;
      } else if (r) {
        emit({ type: "result", response: { result: r.result }, pulledAt: Date.now(), cached: false, ms: Date.now() - started });
        return;
      }
    }
    if (accountId && !input.refresh) {
      const hit = await getCachedDossier(accountId);
      if (hit) {
        const dossier = matchedVia ? { ...hit.dossier, matchedVia } : hit.dossier;
        emit({ type: "result", response: { result: dossier }, pulledAt: hit.pulledAt, cached: true, ms: Date.now() - started });
        return;
      }
    }

    const out = await runLookup({
      query,
      accountId,
      onProgress: (message) => emit({ type: "progress", message }),
      signal,
    });
    const pulledAt = Date.now();
    const r = out.response.result;
    // Normalize page IDs (Claude may return dashed or URL forms).
    const norm = (v: string) => v.replace(/-/g, "").toLowerCase().match(/[0-9a-f]{32}/)?.[0] ?? v;
    if (r.kind === "dossier") r.account.id = norm(r.account.id || r.account.url);
    if (r.kind === "candidates") r.candidates.forEach((c) => (c.accountId = norm(c.accountId || c.url)));
    if (r.kind === "not_found" && r.didYouMean) r.didYouMean.accountId = norm(r.didYouMean.accountId);
    if (r.kind === "dossier" && matchedVia) r.matchedVia = matchedVia;
    if (r.kind === "dossier") {
      await setCachedDossier({ dossier: r, pulledAt });
      if (query) await setCachedQuery(query, r.account.id, r.matchedVia);
    }
    console.log(`[lookup] ${JSON.stringify(query || accountId)} → ${r.kind} in ${out.totalMs}ms, ${out.toolCalls.length} tool calls, model ${out.model}`);
    emit({ type: "result", response: out.response, pulledAt, cached: false, ms: Date.now() - started });
  } catch (e) {
    if (signal?.aborted) {
      console.log(`[lookup] ${JSON.stringify(query || accountId)} cancelled by the browser`);
      return;
    }
    if (e instanceof NotionAuthError) {
      console.error("[lookup] Notion auth failure:", e.message);
      emit({ type: "error", kind: "auth", message: e.message });
      return;
    }
    console.error("[lookup] failed:", (e as Error).message);
    emit({ type: "error", kind: "other", message: "The lookup didn't finish. Try again in a moment." });
  }
}
