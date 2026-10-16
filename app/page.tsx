"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { SearchBox } from "@/components/SearchBox";
import { AskPanel } from "@/components/AskPanel";
import { ArrowRight, ChevronDown } from "@/components/icons";
import { NotionDown } from "@/components/Status";
import { readRecent, type RecentAccount } from "@/components/recent";
import { pulledLabel, shortDay, todayISO } from "@/lib/format";
import type { Attention, AttentionItem } from "@/lib/attention";

const EXAMPLES = ["Willard", "Monty", "Transcend Group", "weston@insurewillard.com"];

function AttentionRow({ item, first, overdue }: { item: AttentionItem; first: boolean; overdue: boolean }) {
  const today = item.due === todayISO();
  return (
    <Link
      href={`/account/${item.accountId}`}
      className={`row -mx-3 grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-4 rounded-lg p-3 text-ink no-underline ${
        first ? "" : "border-t border-line"
      }`}
    >
      <span className={`font-display text-sm font-bold ${overdue || today ? "text-amber" : "text-ink-muted"}`}>
        {today ? "Today" : shortDay(item.due)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{item.account}</span>
        <span className="text-sm leading-5 text-ink-muted">
          {item.task}
          {item.status === "Waiting on Client" && <span className="text-ink-muted"> · Waiting on client</span>}
        </span>
      </span>
      <ArrowRight size={18} stroke="var(--ink-muted)" />
    </Link>
  );
}

function NeedsAttention() {
  const [data, setData] = useState<Attention | null>(null);
  const [error, setError] = useState<"auth" | "other" | null>(null);
  const [showOverdue, setShowOverdue] = useState(false);

  useEffect(() => {
    fetch("/api/attention")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) setError(j.error === "auth" ? "auth" : "other");
        else setData(j);
      })
      .catch(() => setError("other"));
  }, []);

  return (
    <section aria-labelledby="attn-h" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="attn-h" className="m-0 font-display text-xl font-bold leading-7">
          Needs Attention This Week
        </h2>
        <span className="text-sm text-ink-muted">
          Open tasks in Notion{data ? ` · pulled ${pulledLabel(data.pulledAt)}` : ""}
        </span>
      </div>
      {error === "auth" && <NotionDown />}
      {error === "other" && <p className="m-0 text-sm text-ink-muted">Couldn&apos;t load tasks from Notion. Reload to try again.</p>}
      {!data && !error && <p className="m-0 text-sm text-ink-muted">Reading tasks from Notion…</p>}
      {data && (
        <div className="flex flex-col">
          {data.upcoming.length === 0 && <p className="m-0 text-sm text-ink-muted">Nothing due in the next 7 days.</p>}
          {data.upcoming.map((i, n) => (
            <AttentionRow key={i.url} item={i} first={n === 0} overdue={false} />
          ))}
          {data.overdue.length > 0 && (
            <div className={data.upcoming.length ? "mt-2 border-t border-line pt-2" : ""}>
              <button
                type="button"
                onClick={() => setShowOverdue((v) => !v)}
                aria-expanded={showOverdue}
                className="flex w-full items-center justify-between rounded-lg bg-transparent py-2 text-left text-sm font-semibold text-amber"
              >
                {data.overdue.length} overdue {data.overdue.length === 1 ? "task" : "tasks"}
                <ChevronDown size={16} className={showOverdue ? "rotate-180" : ""} />
              </button>
              {showOverdue &&
                data.overdue.map((i, n) => <AttentionRow key={i.url} item={i} first={n === 0} overdue />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RecentlyOpened() {
  const [recent, setRecent] = useState<RecentAccount[]>([]);
  useEffect(() => setRecent(readRecent()), []);
  if (recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-h" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
      <h2 id="recent-h" className="m-0 font-display text-xl font-bold leading-7">
        Recently Opened
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {recent.map((r) => (
          <Link
            key={r.id}
            href={`/account/${r.id}`}
            className="row flex flex-col gap-0.5 rounded-xl bg-raised p-3 text-ink no-underline"
          >
            <span className="font-semibold">{r.name}</span>
            <span className="text-xs leading-4 text-ink-muted">{r.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [authDown, setAuthDown] = useState(false);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setAuthDown(!s.connected))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      <Header variant="home" />
      <main>
        <section className="gridbg border-b border-line">
          <div className="mx-auto flex max-w-[860px] flex-col items-center gap-6 px-4 pb-14 pt-14 text-center sm:px-6 sm:pb-[72px] sm:pt-[88px]">
            <h1 className="m-0 font-display text-[40px] font-extrabold leading-[42px] tracking-[-1px] sm:text-[56px] sm:leading-[54px] sm:tracking-[-1.4px]">
              <span className="text-brand-text">Ella&apos;s</span> <br />
              Account Search Tool
            </h1>
            <p className="m-0 max-w-[560px] text-lg leading-7 text-ink-muted">
              Type an agency, a person, an email or a nickname, then press Enter.
            </p>
            {authDown && <NotionDown />}
            <SearchBox size="hero" autoFocus />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-ink-muted">Try</span>
              {EXAMPLES.map((ex) => (
                <Link
                  key={ex}
                  href={`/search?q=${encodeURIComponent(ex)}`}
                  className="chip rounded-full border border-line bg-surface px-3 py-1.5 text-sm leading-5 text-ink-soft no-underline"
                >
                  {ex}
                </Link>
              ))}
            </div>
            <p className="m-0 text-sm leading-5 text-ink-muted">
              One match opens the account. Several show a short list. A contact opens their agency.
            </p>
          </div>
        </section>

        <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-6 px-4 pb-24 pt-12 sm:px-6">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <NeedsAttention />
            <RecentlyOpened />
          </div>
          <AskPanel />
        </div>
      </main>
    </div>
  );
}
