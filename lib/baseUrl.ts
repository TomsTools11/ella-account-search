/**
 * Public base URL for the Notion OAuth redirect. Uses APP_BASE_URL when it's a real address;
 * otherwise (unset, a localhost value copied into Vercel, or a preview deployment) the URL the request came in on.
 */
export function baseUrl(req: Request): string {
  const env = process.env.APP_BASE_URL?.replace(/\/$/, "");
  const fromRequest = new URL(req.url).origin;
  // A preview deployment signs in on its own URL, never the live site's.
  if (!env || process.env.VERCEL_ENV === "preview") return fromRequest;
  if (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(env)) return fromRequest;
  return env;
}
