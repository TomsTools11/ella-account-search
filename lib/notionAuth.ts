import { OAuthError, oauthProvider, type Tokens } from "./oauth";

// Notion's hosted MCP server. Storage keys (notion_oauth_*) are unchanged from earlier builds.

export const NOTION_MCP_URL = "https://mcp.notion.com/mcp";

export class NotionAuthError extends OAuthError {
  constructor(message: string, reauthRequired: boolean) {
    super("notion", message, reauthRequired);
    this.name = "NotionAuthError";
  }
}

export const notion = oauthProvider({
  id: "notion",
  label: "Notion",
  mcpUrl: NOTION_MCP_URL,
  authServer: "https://mcp.notion.com",
  scope: "default",
  makeError: (m, r) => new NotionAuthError(m, r),
});

export type { Tokens };
export const startAuthorization = notion.startAuthorization;
export const completeAuthorization = notion.completeAuthorization;
export const getStoredTokens = notion.getStoredTokens;
export const getAccessToken = notion.getAccessToken;
