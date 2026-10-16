import { NextResponse } from "next/server";
import { completeAuthorization } from "@/lib/notionAuth";
import { baseUrl } from "@/lib/baseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = baseUrl(req);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  try {
    if (!code || !state) throw new Error(url.searchParams.get("error") ?? "missing code");
    await completeAuthorization(`${base}/api/notion/callback`, code, state);
    return NextResponse.redirect(`${base}/admin?connected=1`);
  } catch (e) {
    console.error("[notion callback]", (e as Error).message);
    return NextResponse.redirect(`${base}/admin?error=${encodeURIComponent((e as Error).message.slice(0, 120))}`);
  }
}
