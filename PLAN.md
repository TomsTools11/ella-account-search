# Ella Account Lookup: Build Plan

Private, read-only web app for Ella to look up Tom's GOAL accounts while he's on leave (Tue Oct 27 – Tue Nov 10, 2026).
Hand-off deadline: **Fri Oct 23, 2026**.

Tick items as they finish so a new session can resume from here.

## Decisions log

- **2026-10-16** Live schema checked against the brief. All six data source IDs and every listed property match. Extra properties exist (not used unless needed): Accounts `Added on`, `Updated at`, `Archive` (button); Contacts `Note(s)`, `Task(s)`, `State`/`Meeting Notes` rollups; Tasks `Created`, `Notes`, `Project`, `Contact(s)`, rollups; Notes `Updated`, `Account Status`; Meeting Notes `Calendar Match` (select), `Contact`/`Campaigns`/`Account Status` rollups; Projects `Attach file`, `Progress` rollup. Projects Status options are `Planning`, `In progress`, `Done`.
- **2026-10-16** Archived pages stay on an account's relation lists (e.g. Willard links an archived task and an archived Research note). SQL `query-data-sources` excludes archived rows, so the prompt queries each data source by account ID instead of following relation lists.
- **2026-10-16** Page URLs from SQL look like `https://app.notion.com/<32-hex id>`. Relation columns are JSON arrays of those URLs, so `"<relation>" LIKE '%<id>%'` finds an account's rows.
- **2026-10-16** Hosted Notion MCP: `https://mcp.notion.com/mcp`, OAuth 2.0 + PKCE with dynamic client registration. Access token ~8h, refresh token rotates on every refresh (previous one valid briefly), 180-day absolute cap, dies after 30 days without a refresh. Refresh 10 min before expiry under a lock.
- **2026-10-16** Claude API MCP connector: beta `mcp-client-2025-11-20`, allowlist via `mcp_toolset.default_config.enabled=false` + `configs.<tool>.enabled=true`. Allowed tools: `notion-search`, `notion-fetch`, `notion-query-data-sources`, `notion-query-meeting-notes`. Every other tool (all writes) is disabled at the API layer.

## Milestone 1: Go/no-go (server script, Willard dossier JSON with timing)

- [x] Confirm data source IDs and property names against live Notion
- [x] Read current MCP connector docs and Notion MCP OAuth docs
- [x] Record Willard ground truth (see `scripts/fixtures/willard.expected.json`)
- [x] Project skeleton: Next.js + TS + Tailwind deps, `.env.example`, `.gitignore`, `.env.local` (generated encryption key)
- [x] `config/workspace.json` (data sources, exclusions) and `config/aliases.json`
- [x] Encrypted token store (local file in dev, Upstash Redis in prod) + auto-refresh with lock (`lib/store.ts`, `lib/notionAuth.ts`)
- [x] `scripts/notion-auth.ts`: one-time local OAuth sign-in (dynamic client registration verified working)
- [x] zod schemas for search result (dossier / candidates / not found) (`lib/schemas.ts`)
- [x] Search/dossier system prompt with workspace map + aliases (`lib/prompts.ts`)
- [x] `scripts/go-no-go.ts`: Claude + Notion MCP (read tools only), prints JSON, validates, times it, diffs vs. ground truth
- [x] Tom: add `ANTHROPIC_API_KEY` to `.env.local`, run sign-in
- [x] Run go/no-go; record timing and path chosen (primary vs fallback)
  - Primary path (Claude API MCP connector → hosted Notion MCP, OAuth) works end to end.
  - Structured outputs rejected ("compiled grammar too large") → switched to prompt-specified JSON + zod validation + one corrective retry.
  - willard (Haiku 5.5): 20/20 checks pass, 13.9s, 8 tool calls. riverbend (Haiku): matches Notion, 11.4s. Monty (Sonnet 5.5): alias → Supreme Choice, meeting summary readable, 20.2s, 11 tool calls.
- [x] Milestone 1 passed 2026-10-16. Tom said "go ahead with the next steps" and supplied the design mockup (`Ella Account Lookup.html`) → continued to M2.

## Milestone 2: Search + dossier UI (local)

Design: Tom's mockup `Ella Account Lookup.html` (dark default, light follows system). Fields the mockup shows that Notion doesn't have (Monthly Budget, On GOAL Since, Campaign Setup bids/caps, contact preferences) are left out rather than invented.

- [x] Home: hero search, Try chips, Needs Attention This Week (direct MCP SQL, upcoming 7 days + collapsible overdue), Recently Opened (localStorage), Ask panel shell
- [x] Route `/api/lookup` streaming progress (SSE) + final validated JSON; cancels the Claude call if the browser disconnects
- [x] Results page: candidate list (Contact/Agency badges, ↑↓ Enter), not-found with "Did you mean"
- [x] Dossier `/account/[id]`: header pills, aliases, Open in Notion, Reporting site, at-a-glance (Campaigns, State, Last Meeting, Next Meeting, Next Due), page notes, contacts (Main PoC first), open tasks (overdue marked, Waiting on Client grouped), latest meeting, 10 notes with expand-to-read, projects, pulled-at + Refresh
- [x] 15-min encrypted cache (dossier by account ID, query → account) + Refresh bypass
- [x] Meeting summary fallback text + **"Get meeting summary" button** (Tom's request 10/16): Notion summary → Notion notes → Notion transcript (Claude) → Fathom recording (needs FATHOM_API_KEY)
- [x] Latest meeting = most recent past meeting; next scheduled one shown separately (Byron's only page was the future 11/3 review)
- [x] Auth-failure message (Notion connection down → backup Claude Project, contact Alex)
- [x] Test: willard, Monty, Transcend Group, byron, Supreme Choise, Main PoC email (mbedbury@farmersagent.com) all open the right account; "harbour pt" → not found
- [x] Willard (20/20 checks) and Riverbend dossiers match Notion field by field
- [x] Timing (Haiku 5.5, low effort): 11–21s first lookup, ~20ms cached. Under the 30s bar.
- [x] Mobile (375px) layout, no horizontal scroll
- [ ] Tom: FATHOM_API_KEY to turn on the Fathom fallback; decide Haiku vs Sonnet
- [ ] **STOP for Tom's review**

## Milestone 3: Ask (local)

- [x] Ask system prompt: all seven rules with reasons, plus read-only refusal and conversation grounding (`lib/prompts.ts` askSystemPrompt)
- [x] `/api/ask` streaming (SSE), MODEL env, account context from dossier page, preamble text discarded, cancels on disconnect
- [x] Chat panel on home + dossier per mockup (searching dots, "That isn't in Notion." box, error + Try Again keeps the question); history in sessionStorage only
- [x] Tom 10/16: Ella won't use Notion → all Open-in-Notion links removed app-wide; meeting summaries open in-app
- [x] Tom 10/16: sources not needed → no citations shown; Claude still lists pages used in a hidden block (server log only) to stay grounded
- [x] Tests (Haiku 5.5): Riverbend main contact ✓ (Mandi Bedbury, mbedbury@farmersagent.com); Foreman open tasks ✓ (1: Reverse $500 Oct 8 charge, matches Notion); last Supreme Choice review ✓; Willard CPA → "That isn't in Notion." ✓; "Mark Willard's open tasks complete" → can't make changes, nothing changed ✓ (no write tools exist)
- [x] Three questions written from confirmed notes: Byron Allstate auto launch (10/20, ~20% cut) ✓; what Mandi needs to keep the Marketplace (Folio billing) ✓; Aaron's standing complaint (10–15% bad numbers) ✓
- [x] Follow-up turns keep context without retracting grounded facts
- [ ] **STOP for Tom's review**

## Milestone 4: Deploy

- [ ] Ask Tom: create private GitHub repo
- [ ] Ask Tom: first Vercel deploy; check plan for deployment protection, else passcode gate
- [ ] Passcode gate (middleware + httpOnly cookie) if needed
- [ ] Upstash Redis for tokens + cache (ask before anything paid)
- [ ] Admin route `/admin/notion` for Tom's one-time sign-in on prod
- [ ] `/health`: tiny Notion read, token expiry, forced refresh test
- [ ] Verify: no passcode → refused; no secrets in repo
- [ ] README.md (Ella) and MAINTENANCE.md (Tom)
- [ ] **STOP for Tom's review / hand-off**
