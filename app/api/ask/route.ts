import { runAsk, type AskTurn } from "@/lib/ask";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    history?: AskTurn[];
    account?: { id?: string; name?: string };
  };
  const question = (body.question ?? "").trim().slice(0, 1000);
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-8);
  const id = body.account?.id?.replace(/-/g, "").toLowerCase();
  const account = id && /^[0-9a-f]{32}$/.test(id) && body.account?.name ? { id, name: body.account.name.slice(0, 120) } : undefined;

  return sseResponse(req.signal, async (send, signal) => {
    if (!question) {
      send({ type: "error", kind: "other", message: "Type a question first." });
      return;
    }
    await runAsk({ question, history, account }, send, signal);
  });
}
