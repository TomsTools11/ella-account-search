import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyToken } from "@/lib/session";
import { getStoredTokens } from "@/lib/notionAuth";
import { PasscodeForm } from "@/components/PasscodeForm";
import { ForceRefresh } from "@/components/AdminActions";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const isAdmin = await verifyToken((await cookies()).get(ADMIN_COOKIE)?.value, "admin");
  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-line bg-surface p-8">
          <h1 className="m-0 font-display text-2xl font-extrabold">Admin</h1>
          <PasscodeForm admin next="/admin" />
        </div>
      </main>
    );
  }
  const sp = await searchParams;
  const t = await getStoredTokens().catch(() => null);
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-12">
      <Link href="/" className="text-sm text-ink-muted no-underline">
        ← Home
      </Link>
      <h1 className="m-0 font-display text-3xl font-extrabold">Admin</h1>
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
          Sign in as Tom and approve access. The app only ever uses Notion&apos;s read tools.
        </p>
        {t && <ForceRefresh />}
      </section>
      <Link href="/health">Open the health page</Link>
    </main>
  );
}
