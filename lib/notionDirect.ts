import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DS, ws } from "./config";
import { getAccessToken, NOTION_MCP_URL, NotionAuthError } from "./notionAuth";
import { isAuthFailureText } from "./claude";

// Direct, deterministic reads from the same Notion MCP server, without Claude.
// Used for fixed reads (a note's full body, meeting summaries, the health check).
// Only tools on the read allowlist in config/workspace.json can be called.

export async function callNotionTool(
  name: string,
  args: Record<string, unknown>,
  opts: { token?: string } = {},
): Promise<string> {
  if (!ws.notionTools.includes(name)) throw new Error(`Tool ${name} is not on the read-only allowlist`);
  const token = opts.token ?? (await getAccessToken());
  const transport = new StreamableHTTPClientTransport(new URL(NOTION_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "goal-account-lookup", version: "1.0.0" });
  try {
    await client.connect(transport);
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text?: string }[])
      .map((c) => (c.type === "text" ? c.text ?? "" : ""))
      .join("\n");
    if (res.isError) {
      if (isAuthFailureText(text)) throw new NotionAuthError(`Notion rejected the token: ${text.slice(0, 200)}`, false);
      throw new Error(`Notion ${name} failed: ${text.slice(0, 300)}`);
    }
    return text;
  } catch (e) {
    if (e instanceof NotionAuthError) throw e;
    const msg = (e as Error).message ?? String(e);
    if (isAuthFailureText(msg)) throw new NotionAuthError(`Notion connection failed: ${msg}`, false);
    throw e;
  } finally {
    await client.close().catch(() => {});
  }
}

/** True if this access token can read the HQ Accounts data source (used to vet a new Notion sign-in). */
export async function canReadHQ(token: string): Promise<boolean> {
  try {
    const text = await callNotionTool(
      "notion-query-data-sources",
      { data: { data_source_urls: [DS.accounts], query: `SELECT COUNT(*) AS n FROM "${DS.accounts}"` } },
      { token },
    );
    return ((JSON.parse(text) as { results: { n: number }[] }).results[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Read-only SQL against one or more data sources. Returns the result rows. */
export async function notionSql<T = Record<string, unknown>>(dataSources: string[], query: string, params: unknown[] = []): Promise<T[]> {
  const text = await callNotionTool("notion-query-data-sources", {
    data: { data_source_urls: dataSources, query, params },
  });
  const parsed = JSON.parse(text) as { results: T[] };
  return parsed.results;
}

/** Fetch a page and return its body content (the part inside <content>), plus title. */
export async function notionPageBody(
  id: string,
): Promise<{
  title: string;
  url: string;
  body: string;
  archived: boolean;
  parentDataSource: string | null;
  properties: Record<string, string>;
}> {
  const text = await callNotionTool("notion-fetch", { id });
  let payload: { title?: string; url?: string; text?: string; is_archived?: boolean };
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { text };
  }
  const raw = payload.text ?? "";
  const m = raw.match(/<content>([\s\S]*?)<\/content>/);
  const parent = raw.match(/<parent-data-source url="([^"]+)"/);
  // Readable property values only (skip relations, rollups, formulas, buttons, URLs into Notion).
  const properties: Record<string, string> = {};
  const propJson = raw.match(/<properties>\s*([\s\S]*?)\s*<\/properties>/)?.[1];
  if (propJson) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(propJson) as Record<string, unknown>)) {
        const vals = (Array.isArray(v) ? v : [v]).filter(
          (x): x is string | number => (typeof x === "string" || typeof x === "number") && !/^(rollupResult|formulaResult|<omitted|https:\/\/app\.notion|user:\/\/|<mention)/.test(String(x)),
        );
        if (k === "url" || k.startsWith("date:") && !k.endsWith(":start")) continue;
        if (vals.length) properties[k.replace(/^date:(.+):start$/, "$1")] = vals.join(", ");
      }
    } catch {
      /* properties not JSON: skip */
    }
  }
  return {
    properties,
    parentDataSource: parent ? parent[1] : null,
    title: payload.title ?? "",
    url: (payload.url ?? "").replace(/\?pvs=\d+$/, ""),
    body: (m ? m[1] : raw).trim(),
    archived: !!payload.is_archived,
  };
}
