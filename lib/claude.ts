import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaToolUnion,
  BetaRequestMCPServerURLDefinition,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { DS, model, ws } from "./config";
import { getAccessToken, NOTION_MCP_URL, NotionAuthError } from "./notionAuth";
import { SearchResponse } from "./schemas";
import { searchSystemPrompt, searchUserMessage } from "./prompts";

const MCP_NAME = "notion";
export const BETAS = ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"];

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  // Explicit API key + base URL so a stray ANTHROPIC_BASE_URL in the shell can't redirect calls.
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: "https://api.anthropic.com" });
  return client;
}

/** Notion MCP server + a toolset where only the configured read tools are enabled. */
export async function notionMcp(): Promise<{ mcp_servers: BetaRequestMCPServerURLDefinition[]; tools: BetaToolUnion[] }> {
  const token = await getAccessToken();
  return {
    mcp_servers: [{ type: "url", url: NOTION_MCP_URL, name: MCP_NAME, authorization_token: token }],
    tools: [
      {
        type: "mcp_toolset",
        mcp_server_name: MCP_NAME,
        default_config: { enabled: false },
        configs: Object.fromEntries(ws.notionTools.map((t) => [t, { enabled: true }])),
      },
    ],
  };
}

/** Plain-English progress line for a Notion tool call. */
export function describeToolCall(name: string, input: unknown): string {
  const s = JSON.stringify(input ?? {});
  if (name === "notion-search") return "Searching Notion";
  if (name === "notion-query-meeting-notes") return "Reading meeting notes";
  if (name === "notion-fetch") return "Opening a Notion page";
  if (name === "notion-query-data-sources") {
    const hits = [
      [DS.tasks, "Reading tasks"],
      [DS.notes, "Reading notes"],
      [DS.meetingNotes, "Reading meeting notes"],
      [DS.projects, "Reading projects"],
      [DS.contacts, "Reading contacts"],
      [DS.accounts, "Reading accounts"],
    ].filter(([ds]) => s.includes(ds));
    if (hits.length === 1) return hits[0][1];
    if (hits.length > 1) return "Searching accounts and contacts";
  }
  return "Reading Notion";
}

export type ToolCallLog = { name: string; input: unknown; atMs: number; isError?: boolean; errorText?: string };

export function isAuthFailureText(text: string): boolean {
  return /\b(401|unauthori[sz]ed|invalid[_ ]token|token (has )?expired|authentication)\b/i.test(text);
}

function textOf(blocks: BetaContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<BetaContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export type LookupOutcome = {
  response: SearchResponse;
  totalMs: number;
  toolCalls: ToolCallLog[];
  usage: { input: number; output: number; cacheRead: number };
  model: string;
};

export async function runLookup(opts: {
  query: string;
  accountId?: string;
  onProgress?: (message: string) => void;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}): Promise<LookupOutcome> {
  const started = Date.now();
  const { mcp_servers, tools } = await notionMcp();
  const messages: BetaMessageParam[] = [{ role: "user", content: searchUserMessage(opts.query, opts.accountId) }];
  const toolCalls: ToolCallLog[] = [];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  let repaired = false;
  opts.onProgress?.(opts.accountId ? "Opening account" : "Searching Notion");

  for (let turn = 0; turn < 6; turn++) {
    const stream = anthropic().beta.messages.stream({
      model: model(),
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      system: [{ type: "text", text: searchSystemPrompt(), cache_control: { type: "ephemeral" } }],
      messages,
      mcp_servers,
      tools,
      output_config: { effort: opts.effort ?? (process.env.LOOKUP_EFFORT as "low") ?? "low" },
    }, { signal: opts.signal });

    stream.on("contentBlock", (block) => {
      if (block.type === "mcp_tool_use") {
        toolCalls.push({ name: block.name, input: block.input, atMs: Date.now() - started });
        opts.onProgress?.(describeToolCall(block.name, block.input));
      } else if (block.type === "mcp_tool_result" && block.is_error) {
        const text = Array.isArray(block.content)
          ? block.content.map((c) => ("text" in c ? c.text : "")).join(" ")
          : String(block.content);
        const last = toolCalls[toolCalls.length - 1];
        if (last) Object.assign(last, { isError: true, errorText: text.slice(0, 300) });
        if (isAuthFailureText(text)) {
          stream.abort();
        }
      }
    });

    let msg;
    try {
      msg = await stream.finalMessage();
    } catch (e) {
      const authErr = toolCalls.find((t) => t.isError && t.errorText && isAuthFailureText(t.errorText));
      if (authErr) throw new NotionAuthError(`Notion rejected the token: ${authErr.errorText}`, false);
      if (e instanceof Anthropic.APIError && isAuthFailureText(e.message) && /mcp|notion/i.test(e.message)) {
        throw new NotionAuthError(`Notion MCP connection failed: ${e.message}`, false);
      }
      throw e;
    }
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0;

    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason === "tool_use") {
      // Only Notion MCP tools exist; answer any stray client tool call with an error and continue.
      const stray = msg.content.filter((b) => b.type === "tool_use");
      messages.push({ role: "assistant", content: msg.content });
      messages.push({
        role: "user",
        content: stray.map((b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          is_error: true,
          content: "That tool does not exist. Use only the Notion tools, then return the JSON.",
        })),
      });
      continue;
    }
    if (msg.stop_reason === "refusal") throw new Error("The model declined this lookup");
    if (msg.stop_reason === "max_tokens") throw new Error("Lookup response was cut off (max_tokens)");

    const text = textOf(msg.content);
    const check = parseSearchResponse(text);
    if (check.ok) {
      return { response: check.value, totalMs: Date.now() - started, toolCalls, usage, model: model() };
    }
    if (repaired) throw new Error(`Lookup returned invalid JSON after a retry: ${check.error}`);
    // One corrective turn: send the validation error back without re-running the lookup.
    repaired = true;
    messages.push({ role: "assistant", content: msg.content });
    messages.push({
      role: "user",
      content: `Your JSON did not validate: ${check.error}\nReturn only the corrected JSON object, no other text, and make no tool calls.`,
    });
  }
  throw new Error("Lookup did not finish");
}

/** Pull the JSON object out of the model's final text and validate it. */
export function parseSearchResponse(text: string): { ok: true; value: SearchResponse } | { ok: false; error: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return { ok: false, error: "no JSON object found" };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { ok: false, error: `not valid JSON (${(e as Error).message})` };
  }
  const r = SearchResponse.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
