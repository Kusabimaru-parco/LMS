// Cross-site request check for route handlers that change data (server actions get this from Next.js).
// A browser always sends Origin on cross-site POSTs; it must match the site the request was sent to.
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
