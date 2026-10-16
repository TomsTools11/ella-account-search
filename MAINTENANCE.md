# Maintenance — for Tom

How the app works, and what to do when something needs changing.

## How it fits together

- **Next.js on Vercel.** Search and dossiers call the Claude API with Notion's hosted MCP server attached (`https://mcp.notion.com/mcp`). Only four read tools are enabled at the API level: `notion-search`, `notion-fetch`, `notion-query-data-sources`, and `notion-query-meeting-notes`. Write tools never reach Claude.
- **Direct reads.** A few fixed reads skip Claude and call the same MCP read tools from the server: a note's full text, meeting summaries, and `/health`. (Tasks aren't shown in the app: Ella replies to client email and doesn't work Tom's task list. Ask can still read task records as background.)
- **Fathom (optional).** If `FATHOM_API_KEY` is set, the "Get meeting summary" button falls back to Fathom recordings when Notion has no summary.
- **Storage.** Upstash Redis holds the encrypted Notion tokens and the 15-minute caches. Locally it uses `.data/` instead, which is gitignored.

## Access

There's no login: anyone with the URL can use the app, including `/admin`. That was Tom's call (10/16) to keep it simple for Ella. The site is excluded from search engines. Keep the URL private and keep a monthly spend limit on the Anthropic key, since every lookup and question is billed to it.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Console API key |
| `MODEL` | Claude model for search and Ask. Default `claude-sonnet-5-5`; currently `claude-haiku-5-5` |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64. Encrypts stored Notion tokens and caches |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Added automatically by the Upstash integration (`KV_REST_API_*` also work) |
| `FATHOM_API_KEY` | Optional. Fathom → Settings → API Access |

Generate random values with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit any of these. `.env.local` is gitignored.

## Re-authorizing Notion

Notion sign-ins end 180 days after you sign in, or after 30 days without a refresh. The app refreshes the token about every 8 hours whenever it's used.

1. Open `https://<app>/admin`.
2. Click **Connect Notion** (or **Reconnect Notion**), sign in as yourself, and approve.
3. Click **Force a token refresh**. It should say "Refresh token rotated: yes".
4. Open `/health`. Everything should be green.

For local development, run `npm run notion:auth` instead (it needs port 3000 free).

## Rotating keys

- **Anthropic key:** create a new key in the Console, replace `ANTHROPIC_API_KEY` in Vercel, redeploy, then revoke the old key.
- **`TOKEN_ENCRYPTION_KEY`:** changing it makes the stored Notion tokens unreadable. Change it, redeploy, then re-authorize Notion as above.

## Editing aliases and exclusions (no code changes)

- `config/aliases.json` maps nicknames to the exact Client Account title. Add a line such as `"Big Mike": "Mike Morrison Insurance"`.
- `config/workspace.json` holds the Notion data source IDs and property names, the excluded account titles (`GOAL Internal Meetings`), excluded note types (`Daily Brief`), the read-tool allowlist, and Fathom settings.

Commit and push; Vercel redeploys automatically. Cached dossiers expire within 15 minutes.

## Checking health

`/health` runs a tiny live Notion read (counts the account rows) and shows:

- when the access token next expires
- the latest date the Notion sign-in is guaranteed to last
- whether the Claude and Fathom keys are set

`/api/health` returns the same data as JSON, with HTTP 503 when something is wrong, so you can point an uptime monitor at it.

## Testing locally

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:3000. Then:

- `npm run go-no-go` runs the Willard end-to-end check. It needs `scripts/fixtures/willard.expected.json`, which is kept out of git.
- `npm run typecheck`

## If Ella reports a problem

- **"Notion connection is down":** check `/health`. If the sign-in has expired, re-authorize as above. Ella's fallback is the backup Claude Project, and Alex is her contact.
- **Slow lookups:** Vercel → Logs show `[lookup] … in Nms, N tool calls`.
- **Wrong or missing data:** check that the record exists in Notion and isn't archived (archived pages are skipped on purpose).
