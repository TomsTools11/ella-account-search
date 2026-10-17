"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Header } from "@/components/Header";
import { DossierView } from "@/components/Dossier";
import { AskPanel } from "@/components/AskPanel";
import { useLookup } from "@/components/useLookup";
import { ErrorBox, NotionDown, Progress } from "@/components/Status";
import { pushRecent } from "@/components/recent";
import type { Dossier } from "@/lib/schemas";

function AccountPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const query = sp.get("q") ?? undefined;
  const via = sp.get("via") ?? undefined;
  const params = useMemo(() => ({ accountId: id }), [id]);
  const { state, refresh, retry } = useLookup(params);
  const last = useRef<{ d: Dossier; pulledAt: number; cached: boolean } | null>(null);

  if (state.status === "done" && state.response.result.kind === "dossier") {
    last.current = { d: state.response.result, pulledAt: state.pulledAt, cached: state.cached };
  }
  const shown = last.current;

  useEffect(() => {
    if (!shown) return;
    const a = shown.d.account;
    pushRecent({ id: a.id, name: a.name, sub: [a.state, a.campaigns.join(", ")].filter(Boolean).join(" · ") });
    document.title = `${a.name} · Paternity Leave Account Search`;
  }, [shown]);

  return (
    <div className="min-h-screen">
      <Header variant="compact" />
      {shown ? (
        <>
          {state.status === "error" && (
            <div className="mx-auto max-w-[1180px] px-4 pt-6 sm:px-6">
              {state.kind === "auth" ? <NotionDown /> : <ErrorBox message={state.message} onRetry={refresh} />}
            </div>
          )}
          <DossierView
            d={shown.d}
            pulledAt={shown.pulledAt}
            cached={shown.cached}
            refreshing={state.status === "loading"}
            onRefresh={refresh}
            query={query}
            via={via}
            aside={<AskPanel account={{ id: shown.d.account.id, name: shown.d.account.name }} />}
          />
        </>
      ) : (
        <main className="mx-auto flex max-w-[820px] flex-col gap-6 px-4 pb-24 pt-12 sm:px-6">
          {state.status === "error" ? (
            state.kind === "auth" ? (
              <NotionDown />
            ) : (
              <ErrorBox message={state.message} onRetry={retry} />
            )
          ) : state.status === "done" ? (
            <ErrorBox message="That account couldn't be found in Notion." />
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
              <Progress steps={state.status === "loading" ? state.steps : []} label="Opening account" />
              <p className="m-0 text-xs leading-4 text-ink-muted">Live from Notion. A first lookup usually takes 10–20 seconds.</p>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AccountPage />
    </Suspense>
  );
}
