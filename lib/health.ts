import { DS } from "./config";
import { getStoredTokens } from "./notionAuth";
import { notionSql } from "./notionDirect";
import { superhuman } from "./superhumanAuth";
import { callMcpTool } from "./mcpDirect";
import { ws } from "./config";
import { noul } from "@typesafe-ai/sdk";
import { askJev, jevSearchOn, JEV_MODEL } from "./jev";

export type Health = {
  ok: boolean;
  checkedAt: number;
  notionRead: { ok: boolean; ms: number; accounts?: number; error?: string };
  token: {
    connected: boolean;
    accessExpiresAt: number | null;
    lastRefreshAt: number | null;
    signedInAt: number | null;
    /** Notion ends a grant 180 days after sign-in, or after 30 days without a refresh. */
    grantEndsBy: number | null;
  };
  email: { connected: boolean; ok: boolean; account?: string; accessExpiresAt: number | null; error?: string };
  anthropicKey: boolean;
  fathomKey: boolean;
  /** Jev search matching: switched on, key present, and a one-question test call. */
  jev: { on: boolean; keySet: boolean; ok: boolean | null; ms?: number; model?: string };
};

const DAY = 86_400_000;

/** Tiny live Notion read (counts accounts) + token status. getAccessToken inside refreshes if needed. */
export async function checkHealth(): Promise<Health> {
  const started = Date.now();
  let notionRead: Health["notionRead"];
  try {
    const rows = await notionSql<{ n: number }>([DS.accounts], `SELECT COUNT(*) AS n FROM "${DS.accounts}"`);
    notionRead = { ok: true, ms: Date.now() - started, accounts: rows[0]?.n };
  } catch (e) {
    notionRead = { ok: false, ms: Date.now() - started, error: (e as Error).message.slice(0, 200) };
  }
  const st = await superhuman.getStoredTokens().catch(() => null);
  let email: Health["email"] = { connected: !!st, ok: false, account: st?.account, accessExpiresAt: st?.expiresAt ?? null };
  if (st) {
    try {
      await callMcpTool(superhuman, ws.superhuman.tools, "list_accounts", {});
      const after = await superhuman.getStoredTokens();
      email = { ...email, ok: true, accessExpiresAt: after?.expiresAt ?? email.accessExpiresAt };
    } catch (e) {
      email = { ...email, error: (e as Error).message.slice(0, 200) };
    }
  }
  let jev: Health["jev"] = { on: jevSearchOn(), keySet: !!process.env.TYPESAFE_API_KEY, ok: null };
  if (jev.keySet) {
    const t0 = Date.now();
    const r = await askJev("health", "Acme Insurance Agency", { ok: noul("Is this the name of a business?") });
    jev = { ...jev, ok: !!r, ms: Date.now() - t0, model: r?.model ?? JEV_MODEL };
  }
  const t = await getStoredTokens().catch(() => null);
  const last = t?.lastRefreshAt ?? t?.obtainedAt ?? null;
  return {
    ok: notionRead.ok && !!process.env.ANTHROPIC_API_KEY,
    checkedAt: Date.now(),
    notionRead,
    token: {
      connected: !!t,
      accessExpiresAt: t?.expiresAt ?? null,
      lastRefreshAt: last,
      signedInAt: t?.obtainedAt ?? null,
      grantEndsBy: t ? Math.min(t.obtainedAt + 180 * DAY, (last ?? t.obtainedAt) + 30 * DAY) : null,
    },
    email,
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    fathomKey: !!process.env.FATHOM_API_KEY,
    jev,
  };
}
