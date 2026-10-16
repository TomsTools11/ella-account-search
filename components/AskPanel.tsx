"use client";

import { useEffect, useRef, useState } from "react";
import type { AskEvent, AskTurn } from "@/lib/ask";
import { ArrowRight, ChatIcon } from "./icons";
import { Markdown } from "./Markdown";
import { NotionDown, NotInNotion } from "./Status";

type Exchange = { q: string; answer: string; notInNotion: boolean };
type Pending = { q: string; steps: string[]; text: string } | null;

const storeKey = (account?: { id: string }) => `ask_history_${account?.id ?? "home"}`;

function readHistory(key: string): Exchange[] {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "[]") as Exchange[];
  } catch {
    return [];
  }
}

/** Drops any stray [n] citation markers; Ella doesn't need sources. */
const clean = (s: string) => s.replace(/\s?\[\d+(,\s*\d+)*\]/g, "");

function Answer({ ex }: { ex: Exchange }) {
  if (ex.notInNotion) {
    const rest = ex.answer.replace(/^that isn'?t in notion\.?\s*/i, "");
    return <NotInNotion detail={rest ? <Markdown text={clean(rest)} /> : undefined} />;
  }
  return (
    <div className="max-w-[95%]">
      <Markdown text={clean(ex.answer)} />
    </div>
  );
}

export function AskPanel({ account }: { account?: { id: string; name: string } }) {
  const key = storeKey(account);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<{ kind: "auth" | "other"; message: string; q: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(readHistory(key));
  }, [key]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(history.slice(-20)));
    } catch {
      /* storage unavailable */
    }
  }, [history, key]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [history.length, pending?.text]);

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || pending) return;
    setError(null);
    setInput("");
    setPending({ q, steps: [], text: "" });
    const ac = new AbortController();
    abortRef.current = ac;
    const turns: AskTurn[] = history.flatMap((h) => [
      { role: "user" as const, content: h.q },
      { role: "assistant" as const, content: h.answer },
    ]);
    let finished = false;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: turns, account }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Ask failed (${res.status})`);
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
          if (!chunk.startsWith("data: ")) continue;
          const e = JSON.parse(chunk.slice(6)) as AskEvent;
          if (e.type === "progress") setPending((p) => p && { ...p, steps: [...p.steps, e.message] });
          else if (e.type === "text") setPending((p) => p && { ...p, text: p.text + e.delta });
          else if (e.type === "reset") setPending((p) => p && { ...p, text: "" });
          else if (e.type === "done") {
            finished = true;
            setHistory((h) => [...h, { q, answer: e.answer, notInNotion: e.notInNotion }]);
          } else if (e.type === "error") {
            finished = true;
            setError({ kind: e.kind, message: e.message, q });
            setInput(q);
          }
        }
      }
      if (!finished) throw new Error("The answer was cut off");
    } catch (err) {
      if (ac.signal.aborted) return;
      console.error("[ask] client error", err);
      setError({ kind: "other", message: "Couldn't reach Notion. Your question is saved.", q });
      setInput(q);
    } finally {
      setPending(null);
    }
  };

  const placeholder = account ? "e.g. What happened in the last review?" : "e.g. Who is the main contact at Riverbend?";

  return (
    <section
      aria-labelledby="ask-h"
      className="flex max-h-[calc(100vh-48px)] min-w-0 flex-[1_1_340px] flex-col rounded-xl border border-line bg-surface shadow-card lg:sticky lg:top-6"
    >
      <div className="flex items-center gap-3 border-b border-line px-6 py-5">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-tint">
          <ChatIcon size={20} stroke="var(--brand)" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id="ask-h" className="m-0 font-display text-xl font-bold leading-7">
            {account ? `Ask About ${account.name}` : "Ask"}
          </h2>
          <span className="text-sm leading-5 text-ink-muted">Answers come from Notion only</span>
        </div>
        {history.length > 0 && !pending && (
          <button
            type="button"
            onClick={() => setHistory([])}
            className="ml-auto bg-transparent p-0 text-xs font-medium text-ink-muted"
          >
            Clear
          </button>
        )}
      </div>

      <div aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        {history.length === 0 && !pending && (
          <p className="m-0 text-sm leading-5 text-ink-muted">
            Ask anything about {account ? "this account" : "Tom's accounts"}: contacts, what a client asked for, what happened in a
            meeting, what a note says. Answers come only from Tom&apos;s Notion records.
          </p>
        )}
        {history.map((ex, i) => (
          <div key={i} className="flex flex-col gap-4">
            <div className="max-w-[85%] self-end rounded-[12px_12px_4px_12px] bg-brand px-3.5 py-2.5 text-[15px] leading-[22px] text-white">
              {ex.q}
            </div>
            <Answer ex={ex} />
          </div>
        ))}
        {pending && (
          <div className="flex flex-col gap-3">
            <div className="max-w-[85%] self-end rounded-[12px_12px_4px_12px] bg-brand px-3.5 py-2.5 text-[15px] leading-[22px] text-white">
              {pending.q}
            </div>
            {pending.text ? (
              <Markdown text={clean(pending.text)} />
            ) : (
              <div className="flex items-center gap-2.5 text-sm text-ink-muted">
                <span className="flex gap-1">
                  <span className="dot h-1.5 w-1.5 rounded-full bg-brand" />
                  <span className="dot h-1.5 w-1.5 rounded-full bg-brand" />
                  <span className="dot h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                {pending.steps[pending.steps.length - 1] ?? "Reading Notion"}
              </div>
            )}
          </div>
        )}
        {error?.kind === "auth" && <NotionDown />}
        {error?.kind === "other" && (
          <div className="flex items-center gap-3 rounded-xl border border-amber bg-amber-tint px-4 py-3.5">
            <span className="flex-1 text-[15px] text-ink-soft">{error.message}</span>
            <button
              type="button"
              onClick={() => ask(error.q)}
              className="h-9 rounded-lg border border-line-strong bg-transparent px-3.5 text-sm font-semibold text-ink"
            >
              Try Again
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-line px-6 pb-6 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <label htmlFor={account ? "ask2" : "ask"} className="mb-2 block text-xs font-medium leading-4 text-ink-muted">
          {account ? "Ask about this account" : "Ask about any of Tom's accounts"}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={account ? "ask2" : "ask"}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 resize-none rounded-lg border border-line-strong bg-ground px-3 py-2.5 text-[15px] leading-[22px] text-ink outline-none"
          />
          <button
            type="submit"
            disabled={!!pending || !input.trim()}
            aria-label="Send question"
            className="btn-primary flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-brand text-white shadow-brand disabled:opacity-60"
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}
