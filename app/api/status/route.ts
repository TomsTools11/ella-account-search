import { NextResponse } from "next/server";
import { getStoredTokens } from "@/lib/notionAuth";
import { superhuman } from "@/lib/superhumanAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cheap status for the header pill: which sign-ins are stored? (No network call.)
export async function GET() {
  const [n, e] = await Promise.all([getStoredTokens().catch(() => null), superhuman.getStoredTokens().catch(() => null)]);
  return NextResponse.json({ connected: !!n, email: !!e, lastRefreshAt: n?.lastRefreshAt ?? n?.obtainedAt ?? null });
}
