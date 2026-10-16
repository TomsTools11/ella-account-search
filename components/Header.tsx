"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SearchBox } from "./SearchBox";

function NotionPill() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setConnected(!!s.connected))
      .catch(() => setConnected(false));
  }, []);
  if (connected === null) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-raised px-3 py-1 text-xs font-medium leading-4 text-ink-muted">
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-live" : "bg-amber"}`} />
      {connected ? "Live from Notion" : "Notion not connected"}
    </span>
  );
}

function Avatar() {
  return (
    <span
      aria-label="Signed in as Ella"
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
    >
      E
    </span>
  );
}

export function Header({ variant, query }: { variant: "home" | "compact"; query?: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <span className="font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">GOAL</span>
          <span className="h-5 w-px bg-line-strong" />
          <span className="text-sm font-medium text-ink-muted">Account Lookup</span>
        </Link>
        {variant === "compact" ? (
          <>
            <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-[1_1_360px]">
              <SearchBox size="compact" initial={query} />
            </div>
            <Avatar />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <NotionPill />
            <span className="hidden text-sm text-ink-muted sm:inline">Covering Tom&apos;s book</span>
            <Avatar />
          </div>
        )}
      </div>
    </header>
  );
}
