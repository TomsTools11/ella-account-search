import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const h = await checkHealth();
  return NextResponse.json(h, { status: h.ok ? 200 : 503 });
}
