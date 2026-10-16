/**
 * Public base URL for the Notion OAuth redirect. Uses APP_BASE_URL when it's a real address;
 * otherwise (unset, or a localhost value copied into Vercel) the URL the request came in on.
 */
export function baseUrl(req: Request): string {
  const env = process.env.APP_BASE_URL?.replace(/\/$/, "");
  const fromRequest = new URL(req.url).origin;
  if (!env) return fromRequest;
  if (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(env)) return fromRequest;
  return env;
}
