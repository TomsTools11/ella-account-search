import { ws } from "./config";

// Read-only Fathom API client (https://developers.fathom.ai). Used only when Notion has no summary.
const BASE = "https://api.fathom.ai/external/v1";

export type FathomMeeting = {
  recordingId: number;
  title: string;
  url: string;
  startedAt: string;
  invitees: { name: string | null; email: string | null }[];
  summary: string | null;
  actionItems: string[];
};

export const fathomConfigured = () => !!process.env.FATHOM_API_KEY;

type RawMeeting = {
  recording_id: number;
  title?: string;
  meeting_title?: string;
  url: string;
  share_url?: string;
  created_at: string;
  recording_start_time?: string;
  scheduled_start_time?: string;
  calendar_invitees?: { name: string | null; email: string | null }[];
  default_summary?: { markdown_formatted: string | null } | null;
  action_items?: { description: string }[] | null;
};

async function listMeetings(params: URLSearchParams): Promise<{ items: RawMeeting[]; next_cursor: string | null }> {
  const res = await fetch(`${BASE}/meetings?${params}`, { headers: { "X-Api-Key": process.env.FATHOM_API_KEY! } });
  if (res.status === 401) throw new Error("Fathom rejected the API key");
  if (!res.ok) throw new Error(`Fathom list failed: ${res.status}`);
  return res.json();
}

const STOP = new Set(["the", "insurance", "agency", "agencies", "group", "inc", "llc", "and", "of", "solutions", "services"]);
const nameWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Finds the Fathom recording for an account: invitee email matches a contact, or the title names the agency.
 * With `near`, picks the recording closest to that time; otherwise the most recent.
 */
export async function findFathomMeeting(opts: {
  accountName: string;
  contactEmails: string[];
  near?: string | null;
}): Promise<FathomMeeting | null> {
  const emails = new Set(opts.contactEmails.map((e) => e.toLowerCase()));
  const words = nameWords(opts.accountName);
  const nearMs = opts.near ? new Date(opts.near.replace(" ", "T")).getTime() : null;
  const DAY = 86_400_000;

  const params = new URLSearchParams({ include_summary: "true", include_action_items: "true" });
  for (const r of ws.fathom.recordedBy) params.append("recorded_by[]", r);
  // Narrow to calendar invites that include the contacts' email domains.
  for (const dom of new Set([...emails].map((e) => e.split("@")[1]).filter(Boolean))) params.append("calendar_invitees_domains[]", dom);
  params.set("created_after", new Date(nearMs ? nearMs - 2 * DAY : Date.now() - 120 * DAY).toISOString());
  if (nearMs) params.set("created_before", new Date(nearMs + 3 * DAY).toISOString());

  const matches: RawMeeting[] = [];
  for (let page = 0; page < 10; page++) {
    const { items, next_cursor } = await listMeetings(params);
    for (const m of items) {
      const title = (m.title ?? m.meeting_title ?? "").toLowerCase();
      const byEmail = (m.calendar_invitees ?? []).some((i) => i.email && emails.has(i.email.toLowerCase()));
      const byName = words.length > 0 && words.every((w) => title.includes(w));
      if (byEmail || byName) matches.push(m);
    }
    if (!next_cursor || !items.length) break;
    params.set("cursor", next_cursor);
  }
  if (!matches.length) return null;

  const when = (m: RawMeeting) => new Date(m.recording_start_time ?? m.scheduled_start_time ?? m.created_at).getTime();
  matches.sort((a, b) => (nearMs ? Math.abs(when(a) - nearMs) - Math.abs(when(b) - nearMs) : when(b) - when(a)));
  const m = matches[0];
  if (nearMs && Math.abs(when(m) - nearMs) > 2 * DAY) return null;
  return {
    recordingId: m.recording_id,
    title: m.title ?? m.meeting_title ?? "Fathom recording",
    url: m.share_url ?? m.url,
    startedAt: new Date(when(m)).toISOString(),
    invitees: m.calendar_invitees ?? [],
    summary: m.default_summary?.markdown_formatted ?? null,
    actionItems: (m.action_items ?? []).map((a) => a.description).filter(Boolean),
  };
}
