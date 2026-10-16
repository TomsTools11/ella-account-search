import { NextResponse } from "next/server";
import { getAccessToken, getStoredTokens, NotionAuthError } from "@/lib/notionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin only (middleware): forces a Notion token refresh to prove rotation works.
export async function POST() {
  const before = await getStoredTokens();
  try {
    await getAccessToken({ forceRefresh: true });
    const after = await getStoredTokens();
    return NextResponse.json({
      ok: true,
      rotated: !!before && !!after && before.refreshToken !== after.refreshToken,
      expiresAt: after?.expiresAt,
    });
  } catch (e) {
    const reauth = e instanceof NotionAuthError && e.reauthRequired;
    return NextResponse.json({ ok: false, reauth, error: (e as Error).message }, { status: 500 });
  }
}
