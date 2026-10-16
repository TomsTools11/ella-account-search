import { NextResponse } from "next/server";
import { getStoredTokens } from "@/lib/notionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cheap status for the header pill: is a Notion sign-in stored? (No network call.)
export async function GET() {
  const t = await getStoredTokens().catch(() => null);
  return NextResponse.json({ connected: !!t, lastRefreshAt: t?.lastRefreshAt ?? t?.obtainedAt ?? null });
}
