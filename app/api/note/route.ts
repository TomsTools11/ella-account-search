import { NextResponse } from "next/server";
import { notionPageBody } from "@/lib/notionDirect";
import { NotionAuthError } from "@/lib/notionAuth";
import { DS } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full body of one page, for expand-to-read. Only pages in the configured HQ data sources are served.
export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    const page = await notionPageBody(id);
    if (!page.parentDataSource || !Object.values(DS).includes(page.parentDataSource) || page.archived) {
      return NextResponse.json({ error: "not an account record" }, { status: 404 });
    }
    const kind = (Object.entries(DS).find(([, v]) => v === page.parentDataSource)?.[0] ?? "page") as keyof typeof DS;
    return NextResponse.json({ title: page.title, body: page.body, properties: page.properties, kind, id });
  } catch (e) {
    const auth = e instanceof NotionAuthError;
    console.error("[note]", (e as Error).message);
    return NextResponse.json({ error: auth ? "auth" : "other" }, { status: auth ? 503 : 500 });
  }
}
