// Passcode sessions. Works in the Edge middleware and Node routes (Web Crypto only).
// Cookie value = "<role>.<expiry ms>.<HMAC(role.expiry)>", signed with SESSION_SECRET.

export type Role = "user" | "admin";
export const SESSION_COOKIE = "ella_session";
export const ADMIN_COOKIE = "ella_admin";
const DAY = 86_400_000;
export const SESSION_DAYS: Record<Role, number> = { user: 30, admin: 1 };

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function makeToken(role: Role): Promise<{ value: string; maxAge: number }> {
  const exp = Date.now() + SESSION_DAYS[role] * DAY;
  return { value: `${role}.${exp}.${await hmac(`${role}.${exp}`)}`, maxAge: SESSION_DAYS[role] * 86_400 };
}

export async function verifyToken(value: string | undefined, role: Role): Promise<boolean> {
  if (!value) return false;
  const [r, exp, sig] = value.split(".");
  if (r !== role || !exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(`${r}.${exp}`));
}

/** Constant-time passcode check. Returns false when the env var isn't set. */
export function passcodeMatches(input: string, envName: "APP_PASSCODE" | "ADMIN_PASSCODE"): boolean {
  const expected = process.env[envName];
  if (!expected) return false;
  return safeEqual(input, expected);
}
