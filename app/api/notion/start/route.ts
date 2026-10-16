import { NextResponse } from "next/server";
import { startAuthorization } from "@/lib/notionAuth";
import { baseUrl } from "@/lib/baseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sends Tom to Notion to approve read access.
export async function GET(req: Request) {
  return NextResponse.redirect(await startAuthorization(`${baseUrl(req)}/api/notion/callback`));
}
