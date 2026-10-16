import { NextResponse } from "next/server";
import { ADMIN_COOKIE, makeToken, passcodeMatches, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

// POST { passcode, admin? } → sets an httpOnly session cookie.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { passcode?: string; admin?: boolean };
  const passcode = (body.passcode ?? "").trim();
  const admin = !!body.admin;
  await new Promise((r) => setTimeout(r, 400)); // slow down guessing
  if (!passcodeMatches(passcode, admin ? "ADMIN_PASSCODE" : "APP_PASSCODE")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  const roles = admin ? (["admin", "user"] as const) : (["user"] as const);
  for (const role of roles) {
    const t = await makeToken(role);
    res.cookies.set(role === "admin" ? ADMIN_COOKIE : SESSION_COOKIE, t.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: t.maxAge,
    });
  }
  return res;
}
