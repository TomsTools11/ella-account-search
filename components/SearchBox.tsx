"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "./icons";

export function SearchBox({ size, initial = "", autoFocus }: { size: "hero" | "compact"; initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (v) router.push(`/search?q=${encodeURIComponent(v)}`);
  };

  if (size === "compact") {
    return (
      <form
        role="search"
        onSubmit={submit}
        className="flex h-11 items-center gap-2.5 rounded-lg border border-line-strong bg-ground px-3"
      >
        <SearchIcon size={18} stroke="var(--ink-muted)" />
        <label htmlFor="q-compact" className="sr-only">
          Search accounts
        </label>
        <input
          id="q-compact"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search another account"
          className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none"
        />
        <span aria-hidden className="hidden rounded border border-line-strong px-2 py-0.5 text-xs leading-4 text-ink-muted sm:inline">
          Enter
        </span>
      </form>
    );
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex w-full items-center gap-3 rounded-xl border border-line-strong bg-surface py-2 pl-4 pr-2 shadow-card sm:pl-5"
    >
      <SearchIcon size={22} stroke="var(--ink-muted)" />
      <label htmlFor="q" className="sr-only">
        Search accounts
      </label>
      <input
        id="q"
        type="search"
        autoComplete="off"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Willard, Weston, weston@insurewillard.com, “Monty”"
        className="h-12 min-w-0 flex-1 border-0 bg-transparent text-lg text-ink outline-none"
      />
      <span aria-hidden className="hidden rounded border border-line-strong px-2 py-0.5 text-xs leading-4 text-ink-muted sm:inline">
        Enter
      </span>
      <button
        type="submit"
        className="btn-primary inline-flex h-12 items-center rounded-lg bg-brand px-5 text-base font-semibold text-white shadow-brand sm:px-6"
      >
        Search
      </button>
    </form>
  );
}
