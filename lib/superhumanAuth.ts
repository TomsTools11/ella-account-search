import { OAuthError, oauthProvider } from "./oauth";

// Superhuman Mail's hosted MCP server (Tom's mailbox + calendar). Read tools only; see config.

export const SUPERHUMAN_MCP_URL = "https://mcp.mail.superhuman.com/mcp";

export class SuperhumanAuthError extends OAuthError {
  constructor(message: string, reauthRequired: boolean) {
    super("superhuman", message, reauthRequired);
    this.name = "SuperhumanAuthError";
  }
}

export const superhuman = oauthProvider({
  id: "superhuman",
  label: "Superhuman",
  mcpUrl: SUPERHUMAN_MCP_URL,
  authServer: "https://mcp.auth.mail.superhuman.com",
  scope: "openid email profile offline_access",
  makeError: (m, r) => new SuperhumanAuthError(m, r),
});
