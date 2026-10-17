import { NextResponse } from "next/server";
import { connectionFor } from "@/lib/connections";
import { baseUrl } from "@/lib/baseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const c = connectionFor(provider);
  const url = new URL(req.url);
  const base = baseUrl(req);
  if (!c) return NextResponse.redirect(`${base}/admin`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  try {
    if (!code || !state) throw new Error(url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "sign-in was cancelled");
    await c.provider.completeAuthorization(`${base}/api/connect/${provider}/callback`, code, state, c.verify);
    return NextResponse.redirect(`${base}/admin?connected=${provider}`);
  } catch (e) {
    console.error(`[connect ${provider} callback]`, (e as Error).message);
    return NextResponse.redirect(`${base}/admin?error=${encodeURIComponent(`${c.provider.label}: ${(e as Error).message.slice(0, 200)}`)}`);
  }
}
