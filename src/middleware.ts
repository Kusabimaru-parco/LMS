import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Pages anyone can open. Whether first-run setup is finished is checked on the server pages
// themselves (middleware runs on the edge and can't query the database).
const PUBLIC = ["/login", "/setup", "/forgot-password", "/reset-password"];
const PUBLIC_API = ["/api/health", "/api/school/logo", "/manifest.webmanifest", "/sw.js", "/offline.html"];
// Routes that check their own credentials (calendar feed token, SSO state, cron secret) or are harmless (app icon).
const PUBLIC_PREFIX = ["/api/calendar/", "/api/auth/sso/", "/api/auth/signout", "/api/cron", "/api/pwa-icon/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_API.includes(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC.includes(pathname);

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) return new NextResponse("Sign in first.", { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (session && (pathname === "/login" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  const res = NextResponse.next();
  // Over HTTPS, tell browsers to never use plain HTTP for this site again.
  if ((req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return res;
}

export const config = {
  // /api/upload is left out so large uploads aren't buffered by middleware; those routes check the session themselves.
  matcher: ["/((?!_next/static|_next/image|api/upload|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
