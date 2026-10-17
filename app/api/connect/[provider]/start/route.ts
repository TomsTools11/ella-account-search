import { NextResponse } from "next/server";
import { connectionFor } from "@/lib/connections";
import { baseUrl } from "@/lib/baseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One click: sends you straight to the provider's sign-in page.
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const c = connectionFor(provider);
  const base = baseUrl(req);
  if (!c) return NextResponse.redirect(`${base}/admin`);
  try {
    return NextResponse.redirect(await c.provider.startAuthorization(`${base}/api/connect/${provider}/callback`));
  } catch (e) {
    console.error(`[connect ${provider}]`, (e as Error).message);
    return NextResponse.redirect(`${base}/admin?error=${encodeURIComponent(`${c.provider.label}: ${(e as Error).message.slice(0, 160)}`)}`);
  }
}
