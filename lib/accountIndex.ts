import { aliases, DS, ws } from "./config";
import { getCached, setCached } from "./cache";
import { notionSql } from "./notionDirect";

// Every account with its aliases and contacts: the roster search matches against.
// Same two reads Claude's round 1 makes, cached for 15 minutes like the dossiers.

export type IndexedContact = { name: string; role: string | null; email: string | null };
export type IndexedAccount = {
  id: string;
  name: string;
  status: string | null;
  url: string;
  aliases: string[];
  contacts: IndexedContact[];
};

const KEY = "account_index";
const idOf = (s: string) => s.replace(/-/g, "").match(/[0-9a-f]{32}/)?.[0] ?? null;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function getAccountIndex(): Promise<IndexedAccount[]> {
  const hit = await getCached<IndexedAccount[]>(KEY);
  if (hit) return hit.value;

  const [accounts, contacts] = await Promise.all([
    notionSql<Record<string, unknown>>([DS.accounts], `SELECT url, "Client Account", "Status" FROM "${DS.accounts}"`),
    notionSql<Record<string, unknown>>([DS.contacts], `SELECT url, "Name", "Role", "email", "Account" FROM "${DS.contacts}"`),
  ]);

  const excluded = new Set(ws.exclusions.accountTitles.map((t) => t.toLowerCase()));
  const byId = new Map<string, IndexedAccount>();
  for (const row of accounts) {
    const name = str(row["Client Account"]);
    const id = idOf(String(row.url ?? ""));
    if (!name || !id || excluded.has(name.toLowerCase())) continue;
    byId.set(id, { id, name, status: str(row.Status), url: String(row.url), aliases: [], contacts: [] });
  }

  const byName = new Map([...byId.values()].map((a) => [a.name.toLowerCase(), a]));
  for (const [alias, title] of Object.entries(aliases)) byName.get(title.toLowerCase())?.aliases.push(alias);

  for (const row of contacts) {
    const name = str(row.Name);
    if (!name) continue;
    const contact = { name, role: str(row.Role), email: str(row.email)?.toLowerCase() ?? null };
    for (const id of String(row.Account ?? "").match(/[0-9a-f]{32}/g) ?? []) byId.get(id)?.contacts.push(contact);
  }

  const index = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  await setCached(KEY, index);
  return index;
}
