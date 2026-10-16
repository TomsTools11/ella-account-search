import { getKV } from "./store";
import { encrypt, decrypt } from "./crypto";
import type { Dossier } from "./schemas";

// 15-minute caches. Contents are client data, so they're stored encrypted like the tokens.
export const CACHE_TTL_SECONDS = 15 * 60;

export type CachedDossier = { dossier: Dossier; pulledAt: number };

const dossierKey = (accountId: string) => `dossier_${accountId}`;
const queryKey = (q: string) => `query_${q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120)}`;

async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getKV().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw)) as T;
  } catch {
    return null;
  }
}
async function setJSON(key: string, value: unknown) {
  await getKV().set(key, encrypt(JSON.stringify(value)), CACHE_TTL_SECONDS);
}

export const getCachedDossier = (accountId: string) => getJSON<CachedDossier>(dossierKey(accountId));
export const setCachedDossier = (d: CachedDossier) => setJSON(dossierKey(d.dossier.account.id), d);

/** Remembers which account a search query resolved to, so a repeat search skips the matching step. */
export const getCachedQuery = (q: string) => getJSON<{ accountId: string; matchedVia: string }>(queryKey(q));
export const setCachedQuery = (q: string, accountId: string, matchedVia: string) =>
  setJSON(queryKey(q), { accountId, matchedVia });

export async function getCached<T>(key: string) {
  return getJSON<{ value: T; pulledAt: number }>(key);
}
export async function setCached<T>(key: string, value: T) {
  await setJSON(key, { value, pulledAt: Date.now() });
}
