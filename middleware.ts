import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, SESSION_COOKIE, verifyToken } from "@/lib/session";

// Everything is behind the passcode except the login page itself.
// /admin and the Notion sign-in routes also need the separate admin passcode.

const PUBLIC = ["/login", "/api/login"];
const ADMIN = ["/admin", "/api/notion/start", "/api/notion/callback", "/api/admin"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const deny = (to: string) =>
    isApi
      ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL(`${to}?next=${encodeURIComponent(pathname + search)}`, req.url));

  if (ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!(await verifyToken(req.cookies.get(ADMIN_COOKIE)?.value, "admin"))) {
      return pathname === "/admin" ? NextResponse.next() : deny("/admin");
    }
    return NextResponse.next();
  }

  if (!(await verifyToken(req.cookies.get(SESSION_COOKIE)?.value, "user"))) return deny("/login");
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
