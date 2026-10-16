import Link from "next/link";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

const fmt = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) + " CT" : "—";

function Row({ label, ok, children }: { label: string; ok: boolean | null; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
      <span className={`mt-2 h-2.5 w-2.5 flex-none rounded-full ${ok === null ? "bg-line-strong" : ok ? "bg-live" : "bg-amber"}`} />
      <div className="flex flex-col">
        <span className="font-semibold">{label}</span>
        <span className="text-sm text-ink-muted">{children}</span>
      </div>
    </div>
  );
}

export default async function HealthPage() {
  const h = await checkHealth();
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-12">
      <Link href="/" className="text-sm text-ink-muted no-underline">
        ← Home
      </Link>
      <h1 className="m-0 font-display text-3xl font-extrabold">{h.ok ? "Everything is working" : "Something needs attention"}</h1>
      {!h.ok && (
        <p className="m-0 rounded-xl border border-amber bg-amber-tint p-4 text-ink-soft">
          The Notion connection is down. Use the backup Claude Project, and contact Alex.
        </p>
      )}
      <section className="rounded-xl border border-line bg-surface px-5 py-2">
        <Row label="Notion read" ok={h.notionRead.ok}>
          {h.notionRead.ok ? `Read ${h.notionRead.accounts} account rows in ${h.notionRead.ms} ms` : `Failed: ${h.notionRead.error}`}
        </Row>
        <Row label="Notion access token" ok={h.token.connected}>
          {h.token.connected ? `Next expires ${fmt(h.token.accessExpiresAt)} (refreshes automatically)` : "Not connected. Tom needs to sign in at /admin."}
        </Row>
        <Row label="Notion sign-in" ok={h.token.connected ? (h.token.grantEndsBy ?? 0) - Date.now() > 14 * 86_400_000 : false}>
          {h.token.connected
            ? `Signed in ${fmt(h.token.signedInAt)}, last refresh ${fmt(h.token.lastRefreshAt)}. Good until at least ${fmt(h.token.grantEndsBy)} if refreshes keep working.`
            : "—"}
        </Row>
        <Row label="Claude API key" ok={h.anthropicKey}>{h.anthropicKey ? "Set" : "Missing ANTHROPIC_API_KEY"}</Row>
        <Row label="Fathom (optional)" ok={h.fathomKey ? true : null}>
          {h.fathomKey ? "Set; meeting summaries can fall back to Fathom" : "Not set; meeting summaries use Notion only"}
        </Row>
      </section>
      <p className="m-0 text-xs text-ink-muted">Checked {fmt(h.checkedAt)}</p>
    </main>
  );
}
