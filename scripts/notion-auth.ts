// One-time local Notion sign-in for development and the go/no-go test.
// Usage: npm run notion:auth  → open the printed URL, sign in to Notion, approve.
// Tokens are stored encrypted in .data/ (or Upstash if configured).
import http from "node:http";
import { completeAuthorization, startAuthorization } from "../lib/notionAuth";

const base = process.env.APP_BASE_URL || "http://localhost:3000";
const redirectUri = `${base}/api/notion/callback`;
const port = Number(new URL(base).port || 80);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", base);
  if (url.pathname !== "/api/notion/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  try {
    if (error || !code || !state) throw new Error(error ?? "missing code/state");
    const t = await completeAuthorization(redirectUri, code, state);
    res.writeHead(200, { "content-type": "text/html" }).end("<h2>Notion connected. You can close this tab.</h2>");
    console.log(`\nNotion connected. Access token expires ${new Date(t.expiresAt).toLocaleString()}.`);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" }).end(`Sign-in failed: ${(e as Error).message}`);
    console.error("Sign-in failed:", (e as Error).message);
  } finally {
    server.close();
  }
});

server.listen(port, async () => {
  const authUrl = await startAuthorization(redirectUri);
  console.log("Open this URL, sign in to Notion, and approve access:\n");
  console.log(authUrl);
  console.log(`\nWaiting for the redirect on ${redirectUri} ...`);
});
