import { lookup } from "@/lib/lookup";
import { sseResponse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { query?: string; accountId?: string; refresh?: boolean };
  return sseResponse(req.signal, (send, signal) =>
    lookup({ query: body.query?.slice(0, 200), accountId: body.accountId, refresh: !!body.refresh }, send, signal),
  );
}
