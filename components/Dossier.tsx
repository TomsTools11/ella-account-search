"use client";

import Link from "next/link";
import { useState } from "react";
import aliasFile from "@/config/aliases.json";
import type { Dossier as DossierT } from "@/lib/schemas";
import { daysAgo, initials, meetingWhen, monthDay, pageId, pulledLabel, shortDay, todayISO } from "@/lib/format";
import { CalendarIcon, ExternalIcon, LightbulbIcon, PageIcon, RefreshIcon } from "./icons";
import { NotInNotion } from "./Status";
import { Markdown } from "./Markdown";
import type { MeetingSummary } from "@/lib/meetingSummary";

type Contact = DossierT["contacts"][number];
type Task = DossierT["openTasks"][number];
type Note = DossierT["recentNotes"][number];

const card = "rounded-xl border border-line bg-surface";
const h2 = "m-0 font-display text-xl font-bold leading-7";

const STATUS_DOT: Record<string, string> = {
  Active: "bg-live",
  Onboarding: "bg-brand",
  "Waiting on Client": "bg-amber",
  Paused: "bg-line-strong",
};

const ROLE_ORDER = ["Main PoC", "Sales Leader", "Producer", "Admin"];
const roleRank = (r: string | null) => (r && ROLE_ORDER.includes(r) ? ROLE_ORDER.indexOf(r) : ROLE_ORDER.length);

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

const aliasesFor = (name: string) =>
  Object.entries(aliasFile.aliases as Record<string, string>)
    .filter(([, acct]) => acct.toLowerCase() === name.toLowerCase())
    .map(([alias]) => alias);

/** Turns Notion's enhanced markdown into readable plain text. */
export function notionToText(md: string): string {
  return md
    .replace(/<unknown[^>]*\/>/g, "")
    .replace(/<empty-block\/>/g, "")
    .replace(/<\/tr>/g, "\n")
    .replace(/<\/td>\s*<td[^>]*>/g, " | ")
    .replace(/<mention-date start="([^"]+)"[^>]*\/>/g, "$1")
    .replace(/<mention-[a-z]+[^>]*>(.*?)<\/mention-[a-z]+>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\\([^\w\s])/g, "$1")
    .replace(/^---$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "brand" | "soft" }) {
  const cls =
    tone === "brand" ? "bg-tint-strong text-brand-text" : tone === "soft" ? "bg-raised text-ink-soft" : "bg-raised text-ink-muted";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium leading-4 ${cls}`}>{children}</span>;
}

function Glance({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 ${highlight ? "border-brand-line bg-tint" : "border-line bg-surface"}`}>
      <span className="text-xs leading-4 text-ink-muted">{label}</span>
      <span className={`font-display text-xl font-bold leading-7 ${highlight ? "text-brand-text" : ""}`}>{value}</span>
      {sub && <span className="line-clamp-2 text-xs leading-4 text-ink-muted">{sub}</span>}
    </div>
  );
}

function ContactCard({ c }: { c: Contact }) {
  const main = c.role === "Main PoC";
  return (
    <div className={`flex flex-col gap-3 rounded-xl border bg-surface p-5 ${main ? "border-brand-line" : "border-line"}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-full font-display font-bold ${
            main ? "bg-tint-strong text-brand-text" : "bg-raised text-ink-soft"
          }`}
        >
          {initials(c.name)}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[17px] font-semibold text-ink">{c.name}</span>
          <span className="text-sm leading-5 text-ink-muted">{c.role ?? "No role set"}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm leading-5">
        {c.email ? (
          <a href={`mailto:${c.email}`} className="break-all no-underline">
            {c.email}
          </a>
        ) : (
          <span className="text-ink-muted">No email in Notion</span>
        )}
        {c.phone ? (
          <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="no-underline">
            {c.phone}
          </a>
        ) : (
          <span className="text-ink-muted">No phone in Notion</span>
        )}
      </div>
    </div>
  );
}

function TaskRow({ t, last }: { t: Task; last: boolean }) {
  const today = todayISO();
  const due = t.due?.slice(0, 10) ?? null;
  const overdue = !!due && due < today;
  return (
    <li className={`flex items-center gap-3 py-3 ${last ? "" : "border-b border-line"}`}>
      <span aria-hidden className="h-[18px] w-[18px] flex-none rounded border-2 border-line-strong" />
      <span className="flex-1 text-ink">
        {t.title}
        {t.status === "In Progress" && <span className="ml-2 text-xs text-ink-muted">In progress</span>}
      </span>
      <span className={`whitespace-nowrap text-sm ${overdue || due === today ? "font-semibold text-amber" : "text-ink-muted"}`}>
        {!due ? "No due date" : overdue ? `Overdue · ${shortDay(due)}` : due === today ? "Due today" : `Due ${shortDay(due)}`}
      </span>
    </li>
  );
}

function OpenItems({ tasks }: { tasks: Task[] }) {
  const sorted = sortTasks(tasks);
  const active = sorted.filter((t) => t.status !== "Waiting on Client");
  const waiting = sorted.filter((t) => t.status === "Waiting on Client");
  return (
    <section aria-labelledby="open-h" className={`${card} flex flex-col gap-3 p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="open-h" className={h2}>
          Open Tasks
        </h2>
        <span className="text-sm text-ink-muted">{tasks.length ? `${tasks.length} not complete` : ""}</span>
      </div>
      {tasks.length === 0 && <p className="m-0 text-ink-muted">No open tasks in Notion.</p>}
      {active.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {active.map((t, i) => (
            <TaskRow key={t.url} t={t} last={i === active.length - 1} />
          ))}
        </ul>
      )}
      {waiting.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="m-0 mt-2 text-sm font-semibold text-ink-muted">Waiting on Client</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {waiting.map((t, i) => (
              <TaskRow key={t.url} t={t} last={i === waiting.length - 1} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  "notion-summary": "Notion AI meeting summary",
  "notion-notes": "Notes on the Notion meeting page",
  "notion-transcript": "Summarized by Claude from the Notion transcript",
  fathom: "Fathom recording summary",
};

function MeetingSummaryButton({ accountId, label, secondary }: { accountId: string; label: string; secondary?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "error" | "auth">("idle");
  const [data, setData] = useState<MeetingSummary | null>(null);

  const load = async (refresh = false) => {
    setState("loading");
    try {
      const r = await fetch("/api/meeting-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, refresh }),
      });
      const j = await r.json();
      if (!r.ok) return setState(j.error === "auth" ? "auth" : "error");
      setData(j);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  if (data?.found)
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium leading-4 text-ink-muted">
            {SOURCE_LABEL[data.source]}
            {data.source === "fathom" && ` · ${data.title}, ${meetingWhen(data.date)}`}
          </span>
          {data.source === "fathom" && (
            <a href={data.url} target="_blank" rel="noreferrer" className="text-sm no-underline">
              Open in Fathom
            </a>
          )}
        </div>
        <Markdown text={data.markdown} />
        {data.actionItems.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-muted">Action items</span>
            <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-[22px] text-ink-soft">
              {data.actionItems.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      {data && !data.found && <NotInNotion title="No summary found." detail={data.message} />}
      {state === "auth" && <NotInNotion title="The Notion connection is down." detail="Use the backup Claude Project, and contact Alex." />}
      {state === "error" && <span className="text-sm text-ink-muted">Couldn&apos;t get the summary. Try again in a moment.</span>}
      {!data && (
        <button
          type="button"
          onClick={() => load()}
          disabled={state === "loading"}
          className={
            secondary
              ? "inline-flex h-10 items-center gap-2 self-start rounded-lg border border-brand-line bg-transparent px-4 text-sm font-semibold text-ink hover:bg-tint disabled:opacity-70"
              : "btn-primary inline-flex h-10 items-center gap-2 self-start rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-brand disabled:opacity-70"
          }
        >
          {state === "loading" ? (
            <>
              <span className="flex gap-1">
                <span className={`dot h-1.5 w-1.5 rounded-full ${secondary ? "bg-brand" : "bg-white"}`} />
                <span className={`dot h-1.5 w-1.5 rounded-full ${secondary ? "bg-brand" : "bg-white"}`} />
                <span className={`dot h-1.5 w-1.5 rounded-full ${secondary ? "bg-brand" : "bg-white"}`} />
              </span>
              Checking Notion and Fathom
            </>
          ) : (
            label
          )}
        </button>
      )}
    </div>
  );
}

function LatestMeeting({ m, accountId }: { m: DossierT["latestMeeting"]; accountId: string }) {
  return (
    <section aria-labelledby="meet-h" className={`${card} flex flex-col gap-4 p-6`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint">
          <CalendarIcon size={18} stroke="var(--brand)" />
        </span>
        <h2 id="meet-h" className={h2}>
          Latest Meeting
        </h2>
      </div>
      {!m ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-ink-muted">No meeting notes for this account in Notion.</p>
          <MeetingSummaryButton accountId={accountId} label="Find the latest call in Fathom" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-ink">{m.title}</span>
            <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              {meetingWhen(m.date)}
              {m.type && <Pill>{m.type}</Pill>}
              {(daysAgo(m.date) ?? 0) > 30 && <span className="text-amber">{daysAgo(m.date)} days ago</span>}
            </span>
          </div>
          {m.summaryAvailable && m.summary ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[15px] leading-[23px] text-ink-soft">{m.summary}</p>
              {m.actionItems.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-ink-muted">Action items</span>
                  <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-[22px] text-ink-soft">
                    {m.actionItems.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <MeetingSummaryButton accountId={accountId} label="Get full meeting summary" secondary />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <NotInNotion
                title="No summary came through with this meeting."
                detail="Use the button below to check the meeting transcript and Fathom."
              />
              <MeetingSummaryButton accountId={accountId} label="Get meeting summary" />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NoteItem({ n }: { n: Note }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const age = daysAgo(n.date);

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    if (body !== null) return;
    setState("loading");
    try {
      const r = await fetch(`/api/note?id=${pageId(n.url)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setBody(notionToText(j.body));
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)] gap-4">
      <span className="font-display text-sm font-bold text-ink-muted">{monthDay(n.date)}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{n.title}</span>
          {n.type && <Pill>{n.type}</Pill>}
          {age !== null && age > 30 && <span className="text-xs text-amber">{age} days old</span>}
        </span>
        {!open && n.preview && <span className="line-clamp-3 text-sm leading-5 text-ink-muted">{n.preview}</span>}
        {open && (
          <div className="mt-1 rounded-lg bg-raised p-4">
            {state === "loading" && <span className="text-sm text-ink-muted">Reading the note from Notion…</span>}
            {state === "error" && <span className="text-sm text-ink-muted">Couldn&apos;t load the note. Click Show less, then Read note to try again.</span>}
            {body !== null && (body ? <Markdown text={body} /> : <span className="text-sm text-ink-muted">This note has no text.</span>)}
          </div>
        )}
        <span className="flex gap-4 text-sm">
          <button type="button" onClick={toggle} className="bg-transparent p-0 font-medium text-brand-text" aria-expanded={open}>
            {open ? "Show less" : "Read note"}
          </button>
        </span>
      </div>
    </li>
  );
}

export function DossierView({
  d,
  pulledAt,
  cached,
  refreshing,
  onRefresh,
  query,
  via,
  aside,
}: {
  d: DossierT;
  pulledAt: number;
  cached: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  query?: string;
  via?: string;
  aside?: React.ReactNode;
}) {
  const a = d.account;
  const contacts = [...d.contacts].sort((x, y) => roleRank(x.role) - roleRank(y.role));
  const tasks = sortTasks(d.openTasks);
  const next = tasks.find((t) => t.status !== "Waiting on Client" && t.due) ?? tasks.find((t) => t.due);
  const aliases = aliasesFor(a.name);
  const contactMatch = via && /contact|email/i.test(via) && !/account (title|name)/i.test(via);

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 pb-24 pt-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-ink-muted">
        <Link href="/" className="text-ink-muted no-underline">
          Home
        </Link>
        <span aria-hidden>/</span>
        {query && (
          <>
            <Link href={`/search?q=${encodeURIComponent(query)}`} className="text-ink-muted no-underline">
              Results
            </Link>
            <span aria-hidden>/</span>
          </>
        )}
        <span className="text-ink">{a.name}</span>
      </nav>

      {contactMatch && query && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-line bg-tint px-4 py-3 text-[15px]">
          <span className="text-ink-soft">
            You searched <strong className="text-ink">{query}</strong>. Matched {via}, so here is their agency.
          </span>
          <a href="#contacts" className="ml-auto whitespace-nowrap text-sm font-semibold no-underline">
            Jump to contacts
          </a>
        </div>
      )}

      <section className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {a.status && (
              <Pill tone="soft">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[a.status] ?? "bg-line-strong"}`} />
                {a.status}
              </Pill>
            )}
            {a.carrier && <Pill tone="brand">{a.carrier}</Pill>}
            {a.state && <Pill>{a.state}</Pill>}
          </div>
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-[40px] tracking-[-1px] sm:text-5xl sm:leading-[50px] sm:tracking-[-1.2px]">
            {a.name}
          </h1>
          {aliases.length > 0 && (
            <p className="m-0 text-base text-ink-muted">Also called {aliases.map((x) => `“${x}”`).join(", ")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a.reportingSite && (
            <a
              href={a.reportingSite}
              target="_blank"
              rel="noreferrer"
              className="src inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-ink-soft no-underline"
            >
              Reporting site
              <ExternalIcon size={16} />
            </a>
          )}
        </div>
      </section>

      <section aria-label="At a glance" className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        <Glance label="Campaigns" value={a.campaigns.length ? a.campaigns.join(", ") : "None set"} />
        <Glance label="State" value={a.state ?? "Not set"} />
        <Glance
          label="Last Meeting"
          value={d.latestMeeting?.date ? monthDay(d.latestMeeting.date) : "None"}
          sub={d.latestMeeting?.type ?? undefined}
        />
        <Glance
          label="Next Meeting"
          value={d.nextMeeting?.date ? shortDay(d.nextMeeting.date) : "None scheduled"}
          sub={d.nextMeeting ? (d.nextMeeting.type ?? d.nextMeeting.title) : undefined}
        />
        <Glance
          label="Next Due"
          value={next?.due ? shortDay(next.due) : "Nothing"}
          sub={next?.title}
          highlight={!!next}
        />
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          {a.pageNotes && (
            <section aria-labelledby="know-h" className={`${card} flex flex-col gap-4 p-6`}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-tint">
                  <LightbulbIcon size={18} stroke="var(--amber)" />
                </span>
                <h2 id="know-h" className={h2}>
                  Before You Reach Out
                </h2>
              </div>
              <div className="prose-note">{a.pageNotes}</div>
              <span className="text-xs leading-4 text-ink-muted">From the account page in Notion</span>
            </section>
          )}

          <section id="contacts" aria-labelledby="contacts-h" className="flex flex-col gap-3">
            <h2 id="contacts-h" className={h2}>
              Contacts
            </h2>
            {contacts.length === 0 ? (
              <p className="m-0 text-ink-muted">No contacts linked to this account in Notion.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
                {contacts.map((c) => (
                  <ContactCard key={c.url} c={c} />
                ))}
              </div>
            )}
          </section>

          <OpenItems tasks={d.openTasks} />
          <LatestMeeting m={d.latestMeeting} accountId={a.id} />

          <section aria-labelledby="notes-h" className={`${card} flex flex-col gap-4 p-6`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="notes-h" className={h2}>
                Recent Notes
              </h2>
              <span className="text-sm text-ink-muted">{d.recentNotes.length ? `Latest ${d.recentNotes.length}` : ""}</span>
            </div>
            {d.recentNotes.length === 0 ? (
              <p className="m-0 text-ink-muted">No notes for this account in Notion (Daily Briefs are left out).</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-5 p-0">
                {d.recentNotes.map((n) => (
                  <NoteItem key={n.url} n={n} />
                ))}
              </ol>
            )}
          </section>

          {d.projects.length > 0 && (
            <section aria-labelledby="proj-h" className={`${card} flex flex-col gap-3 p-6`}>
              <h2 id="proj-h" className={h2}>
                Projects
              </h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {d.projects.map((p, i) => (
                  <li key={p.url} className={`flex flex-wrap items-center gap-3 py-3 ${i ? "border-t border-line" : ""}`}>
                    <PageIcon size={16} stroke="var(--ink-muted)" />
                    <span className="flex-1 font-medium text-ink">{p.name}</span>
                    {p.status && <Pill>{p.status}</Pill>}
                    {p.deadline && <span className="text-sm text-ink-muted">Deadline {monthDay(p.deadline)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            <span>
              {cached ? "Saved copy pulled from Notion" : "Pulled live from Notion"} {pulledLabel(pulledAt)}
              {cached ? " · refreshes after 15 minutes" : ""}
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-transparent px-3 py-1.5 font-semibold text-ink disabled:opacity-60"
            >
              <RefreshIcon size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh from Notion"}
            </button>
          </div>
        </div>
        {aside}
      </div>
    </main>
  );
}
