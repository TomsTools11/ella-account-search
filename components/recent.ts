"use client";

// "Recently Opened" lives only in this browser (a per-viewer convenience, safe to lose).
export type RecentAccount = { id: string; name: string; sub: string };
const KEY = "recent_accounts_v1";

export function readRecent(): RecentAccount[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentAccount[];
  } catch {
    return [];
  }
}

export function pushRecent(a: RecentAccount) {
  try {
    const list = [a, ...readRecent().filter((r) => r.id !== a.id)].slice(0, 6);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: skip */
  }
}
