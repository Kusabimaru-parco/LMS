// Finishes "Sign in with Google / Microsoft": checks state, exchanges the code, signs the person in
// if an account with that email exists.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/secrets";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Role } from "@/lib/session";
import { SSO_COOKIE, emailFromIdToken, endpoints, getSsoConfig, isProvider, redirectUri } from "@/lib/sso";
import { getBaseUrl, safeRedirectPath } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = await getBaseUrl();
  const fail = (code: string) => {
    const res = NextResponse.redirect(`${base}/login?sso=${code}`);
    res.cookies.delete({ name: SSO_COOKIE, path: "/api/auth/sso" });
    return res;
  };
  if (!isProvider(provider)) return fail("failed");
  const cfg = await getSsoConfig(provider);
  if (!cfg) return fail("off");

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return fail("cancelled");
  const code = url.searchParams.get("code");
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${SSO_COOKIE}=`))?.slice(SSO_COOKIE.length + 1);
  let saved: { state: string; verifier: string; provider: string; next: string } | null = null;
  try {
    saved = cookie ? JSON.parse(decrypt(decodeURIComponent(cookie))) : null;
  } catch {
    saved = null;
  }
  if (!code || !saved || saved.provider !== provider || saved.state !== url.searchParams.get("state")) return fail("failed");

  let idToken: string | undefined;
  try {
    const r = await fetch(endpoints(provider, cfg.tenant).token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(base, provider),
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code_verifier: saved.verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json()) as { id_token?: string; error_description?: string };
    if (!r.ok) console.error(`[campus-lms] ${provider} sign-in failed: ${j.error_description ?? r.status}`);
    idToken = j.id_token;
  } catch (err) {
    console.error(`[campus-lms] ${provider} sign-in failed:`, err);
  }
  const email = idToken ? emailFromIdToken(provider, idToken, cfg.clientId) : null;
  if (!email) return fail("failed");

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return fail("no-account");
  await db.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      // Someone who signs in with Google/Microsoft never needs the temporary password: retire it.
      ...(user.mustChangePassword ? { mustChangePassword: false, passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10) } : {}),
    },
  });

  const next = safeRedirectPath(saved.next);
  const res = NextResponse.redirect(`${base}${next}`);
  res.cookies.set(SESSION_COOKIE, await signSession({ userId: user.id, schoolId: user.schoolId, role: user.role as Role }), {
    ...sessionCookieOptions,
    secure: base.startsWith("https://"),
  });
  res.cookies.delete({ name: SSO_COOKIE, path: "/api/auth/sso" });
  return res;
}
