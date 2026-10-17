import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { anthropic, askMcp, BETAS, describeToolCall, isAuthFailureText } from "./claude";
import { model } from "./config";
import { NotionAuthError } from "./notionAuth";
import { askSystemPrompt } from "./prompts";
import { pageIdOf } from "./ids";
import { askClientTools, CLIENT_TOOL_LABEL, runClientTool } from "./askTools";

export type AskSource = { n: number; title: string; url: string; date: string | null; pageId: string };
export type AskEvent =
  | { type: "progress"; message: string }
  | { type: "text"; delta: string }
  | { type: "reset" }
  | { type: "done"; answer: string; sources: AskSource[]; notInNotion: boolean; ms: number }
  | { type: "error"; kind: "auth" | "other"; message: string };

export type AskTurn = { role: "user" | "assistant"; content: string };

const TAG = "<sources>";

export function parseAnswer(text: string): { answer: string; sources: AskSource[] } {
  const i = text.indexOf(TAG);
  const answer = (i >= 0 ? text.slice(0, i) : text).trim();
  const block = i >= 0 ? text.slice(i + TAG.length).replace(/<\/sources>[\s\S]*$/, "") : "";
  const sources: AskSource[] = [];
  for (const line of block.split("\n")) {
    // Lenient: "1 | Title | URL | date", "[1] Title | URL", "- 1. Title — URL (2026-10-09)" etc.
    const url = line.match(/https?:\/\/[^\s|)\]>]+/)?.[0];
    const n = line.match(/^\s*[-*]?\s*\[?(\d+)/)?.[1];
    if (!url || !n) continue;
    const pageId = pageIdOf(url);
    if (!pageId || sources.some((s) => s.n === Number(n))) continue;
    const parts = line.split("|").map((p) => p.trim());
    const title =
      parts.length >= 3 ? parts[1] : line.replace(url, "").replace(/^\s*[-*]?\s*\[?\d+\]?[.):]?\s*/, "").replace(/[|—–-]\s*$/, "").trim();
    const date = line.replace(url, "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    sources.push({ n: Number(n), title: title || "Notion page", url, date, pageId });
  }
  return { answer, sources };
}

export async function runAsk(
  input: { question: string; history: AskTurn[]; account?: { id: string; name: string } },
  emit: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  try {
    const { mcp_servers, tools: mcpTools, emailAvailable } = await askMcp();
    const clientTools = askClientTools();
    const tools = [...mcpTools, ...clientTools];
    const callsAvailable = clientTools.length > 0;
    const history: BetaMessageParam[] = input.history
      .slice(-8)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
    const messages: BetaMessageParam[] = [
      ...history,
      { role: "user", content: `Current time: ${new Date().toISOString()}\n\n${input.question}` },
    ];
    emit({ type: "progress", message: "Reading Notion" });

    let finalText = "";
    for (let turn = 0; turn < 10; turn++) {
      let current = ""; // text of the answer streamed so far in this request
      let shown = 0;
      let authFail: string | null = null;
      const notionCalls = new Set<string>(); // tool_use ids on the Notion server

      const stream = anthropic().beta.messages.stream(
        {
          model: model(),
          max_tokens: 8000,
          betas: BETAS,
          fallbacks: "default",
          system: [{ type: "text", text: askSystemPrompt(input.account, emailAvailable, callsAvailable), cache_control: { type: "ephemeral" } }],
          messages,
          mcp_servers,
          tools,
          output_config: { effort: (process.env.ASK_EFFORT as "low") ?? "low" },
        },
        { signal },
      );

      stream.on("text", (delta) => {
        current += delta;
        // Forward visible text only; hold back anything that could be the start of the sources block.
        const cut = current.indexOf(TAG);
        let visibleEnd = cut >= 0 ? cut : current.length;
        if (cut < 0) {
          for (let k = Math.min(TAG.length - 1, current.length); k > 0; k--) {
            if (TAG.startsWith(current.slice(-k))) {
              visibleEnd = current.length - k;
              break;
            }
          }
        }
        if (visibleEnd > shown) {
          emit({ type: "text", delta: current.slice(shown, visibleEnd) });
          shown = visibleEnd;
        }
      });
      stream.on("contentBlock", (block) => {
        if (block.type === "tool_use") {
          if (current) emit({ type: "reset" });
          current = "";
          shown = 0;
          emit({ type: "progress", message: CLIENT_TOOL_LABEL[block.name] ?? "Looking something up" });
        } else if (block.type === "mcp_tool_use") {
          if (block.server_name === "notion") notionCalls.add(block.id);
          // Any text before a tool call was preamble, not the answer.
          if (current) emit({ type: "reset" });
          current = "";
          shown = 0;
          emit({ type: "progress", message: describeToolCall(block.name, block.input) });
        } else if (block.type === "mcp_tool_result" && block.is_error) {
          const text = Array.isArray(block.content)
            ? block.content.map((c) => ("text" in c ? c.text : "")).join(" ")
            : String(block.content);
          // Only a Notion auth failure stops Ask; an email problem just leaves email out.
          if (isAuthFailureText(text) && notionCalls.has(block.tool_use_id)) {
            authFail = text.slice(0, 200);
            stream.abort();
          }
        }
      });

      let msg;
      try {
        msg = await stream.finalMessage();
      } catch (e) {
        if (authFail) throw new NotionAuthError(`Notion rejected the token: ${authFail}`, false);
        throw e;
      }

      if (msg.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: msg.content });
        continue;
      }
      if (msg.stop_reason === "tool_use") {
        // Run our own read-only tools (Fathom) and return all results in one message.
        messages.push({ role: "assistant", content: msg.content });
        const uses = msg.content.filter((b) => b.type === "tool_use");
        const results = await Promise.all(
          uses.map(async (b) => {
            try {
              return { type: "tool_result" as const, tool_use_id: b.id, content: await runClientTool(b.name, b.input) };
            } catch (e) {
              return { type: "tool_result" as const, tool_use_id: b.id, is_error: true, content: (e as Error).message.slice(0, 300) };
            }
          }),
        );
        messages.push({ role: "user", content: results });
        continue;
      }
      if (msg.stop_reason === "refusal") throw new Error("The model declined to answer this question");
      // The answer is the text after the last tool call.
      const lastTool = msg.content.map((b) => b.type).lastIndexOf("mcp_tool_result");
      finalText = msg.content
        .slice(lastTool + 1)
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      break;
    }

    const { answer, sources } = parseAnswer(finalText);
    console.log(
      `[ask] ${JSON.stringify(input.question.slice(0, 80))} in ${Date.now() - started}ms; used: ${sources.map((s) => `${s.title} (${s.pageId})`).join("; ") || "none"}`,
    );
    emit({
      type: "done",
      answer,
      sources,
      notInNotion: /^that isn'?t in notion/i.test(answer),
      ms: Date.now() - started,
    });
  } catch (e) {
    if (signal?.aborted) return;
    if (e instanceof NotionAuthError) {
      console.error("[ask] Notion auth failure:", e.message);
      emit({ type: "error", kind: "auth", message: e.message });
      return;
    }
    const msg = e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message;
    console.error("[ask] failed:", msg);
    emit({ type: "error", kind: "other", message: "Couldn't reach Notion. Your question is saved." });
  }
}
