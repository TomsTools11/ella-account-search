import { DS, ws } from "./config";
import { getCached, setCached } from "./cache";
import { notionSql } from "./notionDirect";

export type AttentionItem = {
  task: string;
  status: string;
  due: string;
  url: string;
  account: string;
  accountId: string;
};
export type Attention = { upcoming: AttentionItem[]; overdue: AttentionItem[]; pulledAt: number; cached: boolean };

const KEY = "attention_v1";

/** Open tasks due in the next 7 days, plus overdue ones, across all accounts. One direct SQL read. */
export async function getAttention(opts: { refresh?: boolean } = {}): Promise<Attention> {
  if (!opts.refresh) {
    const hit = await getCached<{ upcoming: AttentionItem[]; overdue: AttentionItem[] }>(KEY);
    if (hit) return { ...hit.value, pulledAt: hit.pulledAt, cached: true };
  }
  const excluded = ws.exclusions.accountTitles;
  const rows = await notionSql<{ url: string; task: string; status: string; due: string; account: string; accountUrl: string }>(
    [DS.tasks, DS.accounts],
    `SELECT t.url, t."Task" AS task, t."Status" AS status, t."date:Due:start" AS due,
            a."Client Account" AS account, a.url AS accountUrl
     FROM "${DS.tasks}" t
     JOIN "${DS.accounts}" a ON t."Account" LIKE '%' || substr(a.url, -32) || '%'
     WHERE t."Status" != 'Complete' AND t."date:Due:start" IS NOT NULL
       AND date(t."date:Due:start") <= date('now', '+7 day')
       AND a."Client Account" NOT IN (${excluded.map(() => "?").join(", ") || "''"})
     ORDER BY t."date:Due:start"`,
    excluded,
  );
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const items: AttentionItem[] = rows.map((r) => ({
    task: r.task,
    status: r.status,
    due: r.due.slice(0, 10),
    url: r.url,
    account: r.account,
    accountId: r.accountUrl.slice(-32),
  }));
  const value = {
    upcoming: items.filter((i) => i.due >= today),
    overdue: items.filter((i) => i.due < today).reverse(),
  };
  await setCached(KEY, value);
  return { ...value, pulledAt: Date.now(), cached: false };
}
