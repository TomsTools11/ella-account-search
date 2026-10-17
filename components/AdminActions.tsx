"use client";

import { useState } from "react";

export function ForceRefresh({ provider }: { provider: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/admin/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider }),
          });
          const j = await r.json();
          setBusy(false);
          setMsg(
            j.ok
              ? `Refreshed. Next expiry ${new Date(j.expiresAt).toLocaleString()}.`
              : `Refresh failed${j.reauth ? ": click Reconnect" : ""}. ${j.error}`,
          );
        }}
        className="self-start bg-transparent p-0 text-sm font-medium text-ink-muted underline-offset-2 hover:underline disabled:opacity-60"
      >
        {busy ? "Testing…" : "Test the connection"}
      </button>
      {msg && <span className="text-sm text-ink-muted">{msg}</span>}
    </div>
  );
}
