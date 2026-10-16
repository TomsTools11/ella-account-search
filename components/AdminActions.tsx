"use client";

import { useState } from "react";

export function ForceRefresh() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/admin/refresh", { method: "POST" });
          const j = await r.json();
          setBusy(false);
          setMsg(
            j.ok
              ? `Refreshed. Refresh token rotated: ${j.rotated ? "yes" : "no"}. Access token now expires ${new Date(j.expiresAt).toLocaleString()}.`
              : `Refresh failed${j.reauth ? " (sign in to Notion again)" : ""}: ${j.error}`,
          );
        }}
        className="h-11 self-start rounded-lg border border-line-strong bg-transparent px-4 font-semibold text-ink disabled:opacity-60"
      >
        {busy ? "Refreshing…" : "Force a token refresh"}
      </button>
      {msg && <span className="text-sm text-ink-muted">{msg}</span>}
    </div>
  );
}
