import { NextResponse } from "next/server";
import { getAttention } from "@/lib/attention";
import { NotionAuthError } from "@/lib/notionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.has("refresh");
  try {
    return NextResponse.json(await getAttention({ refresh }));
  } catch (e) {
    const auth = e instanceof NotionAuthError;
    console.error("[attention]", (e as Error).message);
    return NextResponse.json({ error: auth ? "auth" : "other" }, { status: auth ? 503 : 500 });
  }
}
