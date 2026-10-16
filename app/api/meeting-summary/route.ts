import { NextResponse } from "next/server";
import { getMeetingSummary } from "@/lib/meetingSummary";
import { NotionAuthError } from "@/lib/notionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { accountId?: string; refresh?: boolean };
  const id = (body.accountId ?? "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    return NextResponse.json(await getMeetingSummary(id, { refresh: !!body.refresh }));
  } catch (e) {
    const auth = e instanceof NotionAuthError;
    console.error("[meeting-summary]", (e as Error).message);
    return NextResponse.json({ error: auth ? "auth" : "other" }, { status: auth ? 503 : 500 });
  }
}
