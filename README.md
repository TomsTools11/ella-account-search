# GOAL Account Lookup — guide for Ella

This is a private lookup tool for Tom's GOAL accounts while he's on leave (Tue Oct 27 – Tue Nov 10, 2026). It reads Tom's account records live, so what you see is what's on file right now. It can't change anything and never sends email or messages.

## Opening it

Open the link Tom sent you. There's no login. Bookmark it, and please don't share the link outside GOAL.

## Looking up an account

Type into the search box and press **Enter**. Any of these work:

- an agency name, even partly or misspelled: `willard`, `byron`, `Supreme Choise`
- a person's name: `Weston`, `Mandi Bedbury`
- an email address: `weston@insurewillard.com`
- a nickname Tom uses: `Monty` (Supreme Choice), `Transcend Group` (Janssen Schee)

One clear match opens the account. If several accounts match, you'll get a short list; use ↑ ↓ and Enter, or click one. Searching for a person opens their agency.

The first lookup of an account takes about 10–20 seconds while the tool reads the records. After that the same account opens instantly for 15 minutes.

## Reading an account page

From top to bottom:

- **Header** — status (Active, Onboarding, Paused, Waiting on Client), carrier, state, and a link to the agency's reporting site.
- **At a glance** — campaigns, state, the last meeting, the next scheduled meeting, and the next task that's due.
- **Before You Reach Out** — Tom's notes from the account page, if he left any.
- **Contacts** — the main point of contact first. Click an email to write, or a phone number to call.
- **Open Tasks** — everything not finished, soonest first. Overdue items are marked in orange; items waiting on the client are grouped at the bottom.
- **Latest Meeting** — the summary and action items from the most recent meeting. If no summary came through, click **Get meeting summary**: it checks the meeting transcript and Fathom for you.
- **Recent Notes** — the 10 newest notes with their first few lines. Click **Read note** to read the whole thing.
- **Projects** — if the account has any.
- At the bottom: when the information was pulled. Click **Refresh** if you want the very latest.

The home page also shows **Needs Attention This Week** (tasks due in the next 7 days, plus a list of overdue ones) and the accounts you opened recently.

## Asking questions

Use the **Ask** box on the home page or on any account page. On an account page it already knows which account you mean. Some examples:

- "Who is the main contact at Riverbend and what's their email?"
- "What open tasks does Foreman have?"
- "What happened in the last Supreme Choice review?"

Answers are short and come only from Tom's records. If the records don't cover something, it says **"That isn't in Notion."** and tells you where to look instead:

- **Close** for client emails and history
- **GOAL exports** for performance numbers (CPA, spend, leads)
- **Chris** for platform, billing, or bid questions

It won't recommend bid or budget changes. Those go to Chris, because live bid changes spend client money.

Your questions stay in that browser tab only and clear when you close it.

## If something goes wrong

- **"The Notion connection is down"** — use the backup Claude Project for now, and contact Alex.
- **"Couldn't reach Notion"** — click **Try Again**; your question is saved.
- To check the connection yourself, open `/health` on the same site. Green means everything is working.
