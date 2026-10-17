import { createHash, randomBytes } from "node:crypto";
import { getKV } from "./store";
import { decrypt, encrypt } from "./crypto";

// OAuth 2.0 + PKCE client for a hosted MCP server (Notion, Superhuman). Tom signs in once;
// tokens are stored encrypted and refreshed automatically. Refresh tokens may rotate on
// every refresh, so refreshes are serialized under a lock.

const REFRESH_EARLY_MS = 10 * 60 * 1000;

export class OAuthError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly reauthRequired: boolean,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  obtainedAt: number;
  lastRefreshAt?: number;
  workspaceId?: string;
  /** Who signed in, when the provider tells us (e.g. the mailbox address). */
  account?: string;
  /** The OAuth client this grant belongs to (refresh must use the same one). */
  client?: { client_id: string; client_secret?: string };
};

type Metadata = { authorization_endpoint: string; token_endpoint: string; registration_endpoint: string };
type Client = { client_id: string; client_secret?: string; redirect_uri: string };

export type ProviderConfig = {
  /** Storage key prefix and error label, e.g. "notion". */
  id: string;
  label: string;
  mcpUrl: string;
  authServer: string;
  scope: string;
  makeError: (message: string, reauthRequired: boolean) => OAuthError;
};

async function readJSON<T>(key: string): Promise<T | null> {
  const raw = await getKV().get(key);
  return raw ? (JSON.parse(decrypt(raw)) as T) : null;
}
async function writeJSON(key: string, value: unknown, ttlSeconds?: number) {
  await getKV().set(key, encrypt(JSON.stringify(value)), ttlSeconds);
}
const b64url = (buf: Buffer) => buf.toString("base64url");

export function oauthProvider(cfg: ProviderConfig) {
  const CLIENT_KEY = `${cfg.id}_oauth_client`;
  const TOKENS_KEY = `${cfg.id}_oauth_tokens`;
  const PENDING_KEY = `${cfg.id}_oauth_pending`;
  let metaCache: Metadata | null = null;

  async function metadata(): Promise<Metadata> {
    if (metaCache) return metaCache;
    const res = await fetch(`${cfg.authServer}/.well-known/oauth-authorization-server`);
    if (!res.ok) throw new Error(`${cfg.label} OAuth discovery failed: ${res.status}`);
    metaCache = (await res.json()) as Metadata;
    return metaCache;
  }

  async function getClient(redirectUri: string): Promise<Client> {
    const existing = await readJSON<Client>(CLIENT_KEY);
    if (existing && existing.redirect_uri === redirectUri) return existing;
    const meta = await metadata();
    const res = await fetch(meta.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "GOAL Account Lookup (read-only)",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: cfg.scope,
      }),
    });
    if (!res.ok) throw new Error(`${cfg.label} client registration failed: ${res.status} ${await res.text()}`);
    const reg = (await res.json()) as { client_id: string; client_secret?: string };
    const client: Client = { client_id: reg.client_id, client_secret: reg.client_secret, redirect_uri: redirectUri };
    await writeJSON(CLIENT_KEY, client);
    return client;
  }

  /** Step 1: returns the sign-in URL. */
  async function startAuthorization(redirectUri: string): Promise<string> {
    const meta = await metadata();
    const client = await getClient(redirectUri);
    const verifier = b64url(randomBytes(32));
    const state = b64url(randomBytes(16));
    await writeJSON(PENDING_KEY, { verifier, state }, 15 * 60);
    const url = new URL(meta.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: redirectUri,
      scope: cfg.scope,
      state,
      code_challenge: b64url(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
      resource: cfg.mcpUrl,
      prompt: "consent",
    }).toString();
    return url.toString();
  }

  /**
   * Step 2: exchange the code for tokens. `verify` vets the new grant before it replaces the
   * stored one; it returns an error message to reject, or { account } to accept.
   */
  async function completeAuthorization(
    redirectUri: string,
    code: string,
    state: string,
    verify?: (accessToken: string) => Promise<{ ok: true; account?: string } | { ok: false; message: string }>,
  ): Promise<Tokens> {
    const pending = await readJSON<{ verifier: string; state: string }>(PENDING_KEY);
    if (!pending || pending.state !== state) throw new Error("The sign-in expired or was started twice. Click Connect again.");
    const meta = await metadata();
    const client = await getClient(redirectUri);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: client.client_id,
      redirect_uri: redirectUri,
      code_verifier: pending.verifier,
      resource: cfg.mcpUrl,
    });
    if (client.client_secret) body.set("client_secret", client.client_secret);
    const res = await fetch(meta.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`${cfg.label} token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; workspace_id?: string };
    if (!t.refresh_token) throw new Error(`${cfg.label} didn't return a refresh token, so the connection couldn't stay signed in.`);
    const tokens: Tokens = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
      obtainedAt: Date.now(),
      workspaceId: t.workspace_id,
      client: { client_id: client.client_id, client_secret: client.client_secret },
    };
    await getKV().del(PENDING_KEY);
    if (verify) {
      const v = await verify(tokens.accessToken);
      if (!v.ok) throw new Error(v.message);
      tokens.account = v.account;
    }
    await writeJSON(TOKENS_KEY, tokens);
    return tokens;
  }

  const getStoredTokens = () => readJSON<Tokens>(TOKENS_KEY);
  const disconnect = () => getKV().del(TOKENS_KEY);

  async function refresh(current: Tokens): Promise<Tokens> {
    const meta = await metadata();
    const client = current.client ?? (await readJSON<Client>(CLIENT_KEY));
    if (!client) throw cfg.makeError(`No registered ${cfg.label} client; Tom must connect again`, true);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      client_id: client.client_id,
      resource: cfg.mcpUrl,
    });
    if (client.client_secret) body.set("client_secret", client.client_secret);

    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(meta.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (res.ok) {
        const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
        const next: Tokens = {
          ...current,
          accessToken: t.access_token,
          refreshToken: t.refresh_token ?? current.refreshToken,
          expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
          lastRefreshAt: Date.now(),
        };
        await writeJSON(TOKENS_KEY, next);
        return next;
      }
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      if (err.error === "invalid_grant" || err.error === "invalid_client") {
        // The grant is dead for good: clear it so the app shows "Connect".
        await disconnect();
        throw cfg.makeError(`${cfg.label} refresh rejected (${err.error}); Tom must connect again`, true);
      }
      lastErr = `${res.status} ${err.error ?? ""}`;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    throw cfg.makeError(`${cfg.label} refresh failed: ${lastErr}`, false);
  }

  /** Returns a valid access token, refreshing first if it expires within 10 minutes. */
  async function getAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
    let tokens = await getStoredTokens();
    if (!tokens) throw cfg.makeError(`${cfg.label} is not connected; Tom must connect it`, true);
    const stale = tokens.expiresAt - Date.now() < REFRESH_EARLY_MS;
    if (!stale && !opts.forceRefresh) return tokens.accessToken;

    const kv = getKV();
    for (let i = 0; i < 20; i++) {
      if (await kv.lock(TOKENS_KEY, 30)) {
        try {
          // Re-read under the lock: another request may have refreshed already.
          tokens = await getStoredTokens();
          if (!tokens) throw cfg.makeError(`${cfg.label} is not connected; Tom must connect it`, true);
          const stillStale = tokens.expiresAt - Date.now() < REFRESH_EARLY_MS;
          if (!stillStale && !(opts.forceRefresh && i === 0)) return tokens.accessToken;
          return (await refresh(tokens)).accessToken;
        } finally {
          await kv.unlock(TOKENS_KEY);
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw cfg.makeError(`Timed out waiting for ${cfg.label} token refresh`, false);
  }

  return { id: cfg.id, label: cfg.label, mcpUrl: cfg.mcpUrl, startAuthorization, completeAuthorization, getStoredTokens, getAccessToken, disconnect };
}

export type OAuthProvider = ReturnType<typeof oauthProvider>;
