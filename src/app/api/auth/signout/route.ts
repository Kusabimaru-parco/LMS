// Clears a session cookie that is no longer valid (account removed, password changed, "sign out of
// all devices"). Without this the middleware, which can only check the cookie's signature, would
// keep sending the browser back to the dashboard. A still-valid session is left alone, so another
// site can't sign people out by linking here.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = new URL(req.url);
  if (await getCurrentUser()) return NextResponse.redirect(new URL("/dashboard", base));
  const res = NextResponse.redirect(new URL("/login?expired=1", base));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
