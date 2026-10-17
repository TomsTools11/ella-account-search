import Link from "next/link";
import { CONNECTIONS } from "@/lib/connections";
import { ForceRefresh } from "@/components/AdminActions";

export const dynamic = "force-dynamic";

const ct = (ms: number) => new Date(ms).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) + " CT";

const WHAT: Record<string, string> = {
  notion: "Account records, meeting notes, and Tom's calendar. Needed for search and Ask.",
  superhuman: "Tom's email, so Ask can check recent client emails. Optional: Ask still works from Notion without it.",
};

export default async function Admin({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const rows = await Promise.all(
    Object.entries(CONNECTIONS).map(async ([id, c]) => ({ id, c, t: await c.provider.getStoredTokens().catch(() => null) })),
  );
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-12">
      <Link href="/" className="text-sm text-ink-muted no-underline">
        ← Home
      </Link>
      <h1 className="m-0 font-display text-3xl font-extrabold">Connections</h1>
      {sp.connected && (
        <p className="m-0 rounded-lg bg-tint p-3 text-ink-soft">
          {CONNECTIONS[sp.connected]?.provider.label ?? "Service"} connected. You can close this page.
        </p>
      )}
      {sp.error && <p className="m-0 rounded-lg bg-amber-tint p-3 text-ink-soft">{sp.error}</p>}
      {rows.map(({ id, c, t }) => (
        <section key={id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 flex items-center gap-2 font-display text-xl font-bold">
              <span className={`h-2.5 w-2.5 rounded-full ${t ? "bg-live" : "bg-amber"}`} />
              {c.provider.label}
            </h2>
            <span className="text-sm text-ink-muted">{t ? "Connected" : "Not connected"}</span>
          </div>
          <p className="m-0 text-sm text-ink-muted">{WHAT[id]}</p>
          <a
            href={`/api/connect/${id}/start`}
            className={`inline-flex h-11 items-center self-start rounded-lg px-5 font-semibold no-underline ${
              t ? "border border-line-strong text-ink" : "btn-primary bg-brand text-white shadow-brand"
            }`}
          >
            {t ? `Reconnect ${c.provider.label}` : `Connect ${c.provider.label}`}
          </a>
          <p className="m-0 text-xs text-ink-muted">{c.help} The app only ever reads.</p>
          {t && (
            <>
              <p className="m-0 text-xs text-ink-muted">
                {t.account ? `${t.account} · ` : ""}Connected {ct(t.obtainedAt)}. Renews automatically; current token good until {ct(t.expiresAt)}.
              </p>
              <ForceRefresh provider={id} />
            </>
          )}
        </section>
      ))}
      <Link href="/health" className="text-sm">
        Open the health page
      </Link>
    </main>
  );
}
