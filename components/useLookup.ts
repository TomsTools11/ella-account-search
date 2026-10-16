"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LookupEvent } from "@/lib/lookup";
import type { SearchResponse } from "@/lib/schemas";

export type LookupState =
  | { status: "idle" }
  | { status: "loading"; steps: string[] }
  | { status: "done"; response: SearchResponse; pulledAt: number; cached: boolean; ms: number }
  | { status: "error"; kind: "auth" | "other"; message: string };

/** Reads the server-sent event stream from /api/lookup. */
export async function streamLookup(
  body: { query?: string; accountId?: string; refresh?: boolean },
  onEvent: (e: LookupEvent) => void,
  signal?: AbortSignal,
) {
  const res = await fetch("/api/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Lookup failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (chunk.startsWith("data: ")) onEvent(JSON.parse(chunk.slice(6)) as LookupEvent);
    }
  }
}

export function useLookup(params: { query?: string; accountId?: string } | null) {
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    (refresh = false) => {
      if (!params || (!params.query && !params.accountId)) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setState({ status: "loading", steps: [] });
      streamLookup(
        { ...params, refresh },
        (e) => {
          if (e.type === "progress")
            setState((s) =>
              s.status === "loading" && s.steps[s.steps.length - 1] !== e.message
                ? { status: "loading", steps: [...s.steps, e.message] }
                : s,
            );
          else if (e.type === "result")
            setState({ status: "done", response: e.response, pulledAt: e.pulledAt, cached: e.cached, ms: e.ms });
          else setState({ status: "error", kind: e.kind, message: e.message });
        },
        ac.signal,
      ).catch((err) => {
        if (ac.signal.aborted) return;
        setState({ status: "error", kind: "other", message: (err as Error).message });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params?.query, params?.accountId],
  );

  useEffect(() => {
    run(false);
    return () => abortRef.current?.abort();
  }, [run]);

  return { state, refresh: () => run(true), retry: () => run(false) };
}
