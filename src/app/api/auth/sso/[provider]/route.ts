// Starts "Sign in with Google / Microsoft": redirects to the provider with PKCE and a state value.
import { NextResponse } from "next/server";
import { encrypt } from "@/lib/secrets";
import { SSO_COOKIE, endpoints, getSsoConfig, isProvider, pkce, redirectUri } from "@/lib/sso";
import { getBaseUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = await getBaseUrl();
  if (!isProvider(provider)) return NextResponse.redirect(`${base}/login`);
  const cfg = await getSsoConfig(provider);
  if (!cfg) return NextResponse.redirect(`${base}/login?sso=off`);

  const next = new URL(req.url).searchParams.get("next") ?? "";
  const { verifier, challenge, state } = pkce();
  const url = new URL(endpoints(provider, cfg.tenant).authorize);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(base, provider),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(SSO_COOKIE, encrypt(JSON.stringify({ state, verifier, provider, next })), {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https://"),
    path: "/api/auth/sso",
    maxAge: 600,
  });
  return res;
}
