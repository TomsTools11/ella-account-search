/** Public base URL for OAuth redirects: APP_BASE_URL if set, else the request's origin. */
export function baseUrl(req: Request): string {
  return (process.env.APP_BASE_URL || new URL(req.url).origin).replace(/\/$/, "");
}
