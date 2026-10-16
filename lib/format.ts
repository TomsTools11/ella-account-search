// Date helpers. Tom's book runs on Central time.
const TZ = "America/Chicago";

export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Parses a Notion date ("2026-10-10", "2026-09-29 19:00:00Z", ISO) into a Date. */
export function parseNotionDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`);
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

const dateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** "Mon 10/19" */
export function shortDay(s: string | null | undefined): string {
  const d = parseNotionDate(s);
  if (!d) return "";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "numeric", day: "numeric" };
  if (!dateOnly(s!)) opts.timeZone = TZ;
  return d.toLocaleDateString("en-US", opts).replace(",", "");
}

/** "Oct 9" or "Oct 9, 2025" when not this year */
export function monthDay(s: string | null | undefined): string {
  const d = parseNotionDate(s);
  if (!d) return "";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  if (!dateOnly(s!)) opts.timeZone = TZ;
  return d.toLocaleDateString("en-US", opts);
}

/** "Sep 29, 2:00 PM CT" for datetimes, "Sep 29" for dates */
export function meetingWhen(s: string | null | undefined): string {
  const d = parseNotionDate(s);
  if (!d) return "";
  if (dateOnly(s!)) return monthDay(s);
  return (
    d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }) + " CT"
  );
}

export function daysAgo(s: string | null | undefined): number | null {
  const d = parseNotionDate(s);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** "just now", "6 min ago", "2:14 PM" */
export function pulledLabel(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }) + " CT";
}

export const pageId = (url: string) => url.replace(/-/g, "").match(/[0-9a-f]{32}(?=[^0-9a-f]*$)/)?.[0] ?? "";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
