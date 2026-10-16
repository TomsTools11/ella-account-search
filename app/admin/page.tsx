import Link from "next/link";
import { getStoredTokens } from "@/lib/notionAuth";
import { ForceRefresh } from "@/components/AdminActions";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const t = await getStoredTokens().catch(() => null);
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-12">
      <Link href="/" className="text-sm text-ink-muted no-underline">
        ← Home
      </Link>
      <h1 className="m-0 font-display text-3xl font-extrabold">Notion connection</h1>
      {sp.connected && <p className="m-0 rounded-lg bg-tint p-3 text-ink-soft">Notion connected.</p>}
      {sp.error && <p className="m-0 rounded-lg bg-amber-tint p-3 text-ink-soft">Notion sign-in failed: {sp.error}</p>}
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        <h2 className="m-0 font-display text-xl font-bold">Notion connection</h2>
        <p className="m-0 text-ink-soft">
          {t
            ? `Connected. Access token expires ${new Date(t.expiresAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT and refreshes automatically.`
            : "Not connected yet."}
        </p>
        <a
          href="/api/notion/start"
          className="btn-primary inline-flex h-11 items-center self-start rounded-lg bg-brand px-4 font-semibold text-white no-underline"
        >
          {t ? "Reconnect Notion" : "Connect Notion"}
        </a>
        <p className="m-0 text-xs text-ink-muted">
          Sign in with Tom&apos;s Notion account and approve access. Another account won&apos;t work: the app checks that the
          account can see Tom&apos;s HQ workspace and keeps the current connection if it can&apos;t. The app only ever reads.
        </p>
        {t && <ForceRefresh />}
      </section>
      <Link href="/health">Open the health page</Link>
    </main>
  );
}
