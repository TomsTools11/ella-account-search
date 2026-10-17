import { NextResponse } from "next/server";
import { connectionFor } from "@/lib/connections";
import { OAuthError } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Forces a token refresh for one connection, to prove the stored sign-in still renews.
export async function POST(req: Request) {
  const { provider = "notion" } = (await req.json().catch(() => ({}))) as { provider?: string };
  const c = connectionFor(provider);
  if (!c) return NextResponse.json({ ok: false, error: "unknown connection" }, { status: 400 });
  const before = await c.provider.getStoredTokens();
  try {
    await c.provider.getAccessToken({ forceRefresh: true });
    const after = await c.provider.getStoredTokens();
    return NextResponse.json({
      ok: true,
      rotated: !!before && !!after && before.refreshToken !== after.refreshToken,
      expiresAt: after?.expiresAt,
    });
  } catch (e) {
    const reauth = e instanceof OAuthError && e.reauthRequired;
    return NextResponse.json({ ok: false, reauth, error: (e as Error).message }, { status: 500 });
  }
}
