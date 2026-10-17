import { ws } from "./config";
import { notion } from "./notionAuth";
import { superhuman } from "./superhumanAuth";
import { canReadHQ } from "./notionDirect";
import { callMcpTool } from "./mcpDirect";
import type { OAuthProvider } from "./oauth";

// The two sign-ins the app holds. Each new sign-in is vetted before it replaces a working one.

type Verify = (token: string) => Promise<{ ok: true; account?: string } | { ok: false; message: string }>;

export const CONNECTIONS: Record<string, { provider: OAuthProvider; verify: Verify; help: string }> = {
  notion: {
    provider: notion,
    help: "Sign in with Tom's Notion account and approve.",
    verify: async (token) =>
      (await canReadHQ(token))
        ? { ok: true }
        : {
            ok: false,
            message: "That Notion account can't see Tom's HQ workspace, so the existing connection was kept. Sign in with Tom's Notion account.",
          },
  },
  superhuman: {
    provider: superhuman,
    help: `Sign in with Tom's Superhuman account (${ws.superhuman.expectedAccount}) and approve.`,
    verify: async (token) => {
      const want = ws.superhuman.expectedAccount.toLowerCase();
      try {
        const text = await callMcpTool(superhuman, ws.superhuman.tools, "list_accounts", {}, { token });
        if (text.toLowerCase().includes(want)) return { ok: true, account: ws.superhuman.expectedAccount };
      } catch (e) {
        console.error("[superhuman verify]", (e as Error).message);
      }
      return {
        ok: false,
        message: `That Superhuman sign-in isn't Tom's mailbox (${ws.superhuman.expectedAccount}), so the existing connection was kept.`,
      };
    },
  },
};

export const connectionFor = (id: string) => CONNECTIONS[id] ?? null;
