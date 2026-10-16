"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { useLookup } from "@/components/useLookup";
import { ArrowLeft, ArrowRight, BuildingIcon, SearchIcon, UserIcon } from "@/components/icons";
import { ErrorBox, NotionDown, Progress } from "@/components/Status";

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function Results() {
  const router = useRouter();
  const q = useSearchParams().get("q") ?? "";
  const params = useMemo(() => ({ query: q }), [q]);
  const { state, retry } = useLookup(q ? params : null);
  const [active, setActive] = useState(0);

  // One clear match goes straight to the dossier.
  useEffect(() => {
    if (state.status === "done" && state.response.result.kind === "dossier") {
      const d = state.response.result;
      router.replace(`/account/${d.account.id}?q=${encodeURIComponent(q)}&via=${encodeURIComponent(d.matchedVia)}`);
    }
  }, [state, q, router]);

  const candidates = state.status === "done" && state.response.result.kind === "candidates" ? state.response.result.candidates : [];

  useEffect(() => {
    if (!candidates.length) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, candidates.length - 1));
      else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
      else if (e.key === "Enter") router.push(`/account/${candidates[active].accountId}`);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidates, active, router]);

  return (
    <div className="min-h-screen">
      <Header variant="compact" query={q} />
      <main className="mx-auto flex max-w-[820px] flex-col gap-6 px-4 pb-24 pt-12 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-ink-muted no-underline">
          <ArrowLeft size={16} />
          Home
        </Link>

        {(state.status === "loading" || state.status === "idle" || (state.status === "done" && state.response.result.kind === "dossier")) && (
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
            <div className="flex items-center gap-2.5 text-ink">
              <SearchIcon size={18} stroke="var(--ink-muted)" />
              <span>
                Looking up <strong>“{q}”</strong>
              </span>
            </div>
            <Progress steps={state.status === "loading" ? state.steps : state.status === "done" ? ["Opening account"] : []} />
            <p className="m-0 text-xs leading-4 text-ink-muted">Live from Notion. A first lookup usually takes 10–20 seconds.</p>
          </div>
        )}

        {state.status === "error" &&
          (state.kind === "auth" ? <NotionDown /> : <ErrorBox message={state.message} onRetry={retry} />)}

        {state.status === "done" && state.response.result.kind === "not_found" && (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="flex h-11 items-center gap-2.5 rounded-lg border border-line-strong bg-ground px-3">
              <SearchIcon size={18} stroke="var(--ink-muted)" />
              <span>{q}</span>
            </div>
            <p className="m-0 text-ink-soft">
              No account matches “{q}”.
              {state.response.result.didYouMean && (
                <>
                  {" "}
                  Did you mean{" "}
                  <Link href={`/account/${state.response.result.didYouMean.accountId}`} className="font-semibold no-underline">
                    {state.response.result.didYouMean.accountName}
                  </Link>
                  ?
                </>
              )}
            </p>
          </div>
        )}

        {candidates.length > 0 && (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="m-0 font-display text-[30px] font-extrabold leading-9 tracking-[-0.8px] sm:text-4xl sm:leading-10">
                {candidates.length} matches for “{q}”
              </h1>
              <p className="m-0 text-base text-ink-muted">Pick one to open the account. Contacts open the agency they belong to.</p>
            </div>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {candidates.map((c, i) => {
                const isContact = /contact|email/i.test(c.reason);
                return (
                  <li key={c.accountId}>
                    <Link
                      href={`/account/${c.accountId}`}
                      data-active={i === active}
                      onMouseEnter={() => setActive(i)}
                      className="result grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4 text-ink no-underline"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint">
                        {isContact ? <UserIcon size={20} stroke="var(--brand)" /> : <BuildingIcon size={20} stroke="var(--brand)" />}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[17px] font-semibold">
                            <Highlight text={c.accountName} q={q} />
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium leading-4 ${
                              isContact ? "bg-tint-strong text-brand-text" : "bg-raised text-ink-muted"
                            }`}
                          >
                            {isContact ? "Contact" : "Agency"}
                          </span>
                        </span>
                        <span className="text-sm leading-5 text-ink-muted">
                          <Highlight text={c.reason} q={q} />
                          {c.status ? ` · ${c.status}` : ""}
                        </span>
                      </span>
                      {i === active ? (
                        <span className="hidden items-center gap-2 text-xs text-ink-muted sm:flex">
                          <span aria-hidden className="rounded border border-line-strong px-2 leading-4">
                            Enter
                          </span>
                          Opens account
                        </span>
                      ) : (
                        <ArrowRight size={18} stroke="var(--ink-muted)" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
            <p className="m-0 text-sm leading-5 text-ink-muted">
              Use ↑ ↓ to move and Enter to open. Not here? Try a last name or an email, or use Ask on the home page.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <Results />
    </Suspense>
  );
}
