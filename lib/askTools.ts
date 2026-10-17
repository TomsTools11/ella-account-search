import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { fathomConfigured, getFathomSummary, searchFathomCalls } from "./fathom";

// Client-side tools Ask can call, run on this server. Read-only.

export function askClientTools(): BetaTool[] {
  if (!fathomConfigured()) return [];
  return [
    {
      name: "search_fathom_calls",
      description:
        "List recorded calls (Fathom) for one client account, newest first, with a short summary preview and action items each. " +
        "Pass the account name and its contacts' email addresses from Notion. Use when the question is about what was said or agreed on a call, " +
        "or when a Notion meeting page has no summary.",
      input_schema: {
        type: "object",
        properties: {
          account_name: { type: "string", description: "Client Account title from Notion" },
          contact_emails: { type: "array", items: { type: "string" }, description: "The account's contact emails from Notion" },
          days: { type: "integer", description: "How far back to look, in days (default 180)" },
        },
        required: ["account_name", "contact_emails"],
        additionalProperties: false,
      },
    },
    {
      name: "get_fathom_call_summary",
      description: "Full summary of one recorded call, by recording_id from search_fathom_calls.",
      input_schema: {
        type: "object",
        properties: { recording_id: { type: "integer" } },
        required: ["recording_id"],
        additionalProperties: false,
      },
    },
  ];
}

export const CLIENT_TOOL_LABEL: Record<string, string> = {
  search_fathom_calls: "Searching call recordings",
  get_fathom_call_summary: "Reading a call summary",
};

/** Runs one client tool. Returns text for the tool_result, or throws. */
export async function runClientTool(name: string, input: unknown): Promise<string> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (name === "search_fathom_calls") {
    const accountName = typeof i.account_name === "string" ? i.account_name : "";
    const emails = Array.isArray(i.contact_emails) ? i.contact_emails.filter((e): e is string => typeof e === "string") : [];
    if (!accountName) throw new Error("account_name is required");
    const days = typeof i.days === "number" && i.days > 0 ? Math.min(i.days, 365) : 180;
    const calls = await searchFathomCalls({ accountName, contactEmails: emails, days });
    return calls.length ? JSON.stringify(calls) : "No recorded calls found for this account in that window.";
  }
  if (name === "get_fathom_call_summary") {
    const id = Number(i.recording_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("recording_id must be a positive integer");
    return getFathomSummary(id);
  }
  throw new Error("That tool does not exist.");
}
