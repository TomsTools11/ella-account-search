import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthProvider } from "./oauth";

const AUTH_RE = /\b(401|unauthori[sz]ed|invalid[_ ]token|token (has )?expired|authentication)\b/i;

/**
 * Calls one tool on a provider's hosted MCP server, without Claude. The caller passes the
 * allowlist; anything else is refused before a request is made.
 */
export async function callMcpTool(
  provider: OAuthProvider,
  allow: readonly string[],
  name: string,
  args: Record<string, unknown>,
  opts: { token?: string } = {},
): Promise<string> {
  if (!allow.includes(name)) throw new Error(`Tool ${name} is not on the read-only allowlist`);
  const token = opts.token ?? (await provider.getAccessToken());
  const transport = new StreamableHTTPClientTransport(new URL(provider.mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "goal-account-lookup", version: "1.0.0" });
  const authError = (m: string) => {
    const e = new Error(m) as Error & { authFailure?: boolean };
    e.authFailure = true;
    return e;
  };
  try {
    await client.connect(transport);
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text?: string }[])
      .map((c) => (c.type === "text" ? c.text ?? "" : ""))
      .join("\n");
    if (res.isError) {
      if (AUTH_RE.test(text)) throw authError(`${provider.label} rejected the token: ${text.slice(0, 200)}`);
      throw new Error(`${provider.label} ${name} failed: ${text.slice(0, 300)}`);
    }
    return text;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (!(e as { authFailure?: boolean }).authFailure && AUTH_RE.test(msg)) throw authError(`${provider.label} connection failed: ${msg}`);
    throw e;
  } finally {
    await client.close().catch(() => {});
  }
}
