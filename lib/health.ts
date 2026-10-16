import { DS } from "./config";
import { getStoredTokens } from "./notionAuth";
import { notionSql } from "./notionDirect";

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
  anthropicKey: boolean;
  fathomKey: boolean;
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
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    fathomKey: !!process.env.FATHOM_API_KEY,
  };
}
