"use client";

import { useState } from "react";

export function PasscodeForm({ admin, next }: { admin?: boolean; next: string }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "wrong">("idle");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: code, admin }),
    });
    if (r.ok) window.location.href = next.startsWith("/") ? next : "/";
    else setState("wrong");
  };
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3">
      <label htmlFor="code" className="text-sm font-medium text-ink-muted">
        {admin ? "Admin passcode" : "Passcode"}
      </label>
      <input
        id="code"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="h-12 rounded-lg border border-line-strong bg-ground px-4 text-lg text-ink outline-none"
      />
      {state === "wrong" && <span className="text-sm text-amber">That passcode didn&apos;t work.</span>}
      <button
        type="submit"
        disabled={!code || state === "busy"}
        className="btn-primary h-12 rounded-lg bg-brand font-semibold text-white shadow-brand disabled:opacity-60"
      >
        {state === "busy" ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
