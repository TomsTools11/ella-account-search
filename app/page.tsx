"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { SearchBox } from "@/components/SearchBox";
import { AskPanel } from "@/components/AskPanel";
import { NotionDown } from "@/components/Status";
import { readRecent, type RecentAccount } from "@/components/recent";

const EXAMPLES = ["Willard", "Monty", "Transcend Group", "weston@insurewillard.com"];

function RecentlyOpened({ recent }: { recent: RecentAccount[] }) {
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
  const [recent, setRecent] = useState<RecentAccount[]>([]);
  useEffect(() => {
    setRecent(readRecent());
  }, []);
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

        {recent.length > 0 ? (
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-6 px-4 pb-24 pt-12 sm:px-6">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
              <RecentlyOpened recent={recent} />
            </div>
            <AskPanel />
          </div>
        ) : (
          <div className="mx-auto flex max-w-[860px] px-4 pb-24 pt-12 sm:px-6">
            <AskPanel />
          </div>
        )}
      </main>
    </div>
  );
}
