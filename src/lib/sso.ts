// "Sign in with Google / Microsoft" (OpenID Connect, authorization code flow with PKCE).
// Only people who already have an account (same email) can sign in this way; nobody is created.
import { createHash, randomBytes } from "node:crypto";
import { getSetting, setSetting } from "./settings";

export type Provider = "google" | "microsoft";
export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "microsoft", label: "Microsoft" },
];
export const isProvider = (p: string): p is Provider => p === "google" || p === "microsoft";

const key = (p: Provider, k: string) => `sso.${p}.${k}`;

export async function getSsoConfig(p: Provider) {
  const [clientId, clientSecret, tenant] = await Promise.all([getSetting(key(p, "clientId")), getSetting(key(p, "clientSecret")), getSetting(key(p, "tenant"))]);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, tenant: tenant || "organizations" };
}

export async function getSsoForm() {
  const out: Record<Provider, { clientId: string; hasSecret: boolean; tenant: string }> = {} as never;
  for (const { id } of PROVIDERS) {
    const [clientId, secret, tenant] = await Promise.all([getSetting(key(id, "clientId")), getSetting(key(id, "clientSecret")), getSetting(key(id, "tenant"))]);
    out[id] = { clientId: clientId ?? "", hasSecret: !!secret, tenant: tenant ?? "" };
  }
  return out;
}

export async function saveSsoConfig(p: Provider, v: { clientId: string; clientSecret: string; tenant?: string }) {
  await setSetting(key(p, "clientId"), v.clientId);
  if (v.clientSecret) await setSetting(key(p, "clientSecret"), v.clientSecret, { secret: true });
  if (!v.clientId) await setSetting(key(p, "clientSecret"), "", { secret: true });
  if (p === "microsoft") await setSetting(key(p, "tenant"), v.tenant ?? "");
}

export async function enabledProviders() {
  const out: Provider[] = [];
  for (const { id } of PROVIDERS) if (await getSsoConfig(id)) out.push(id);
  return out;
}

export function endpoints(p: Provider, tenant: string) {
  if (p === "google") return { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token" };
  const t = encodeURIComponent(tenant || "organizations");
  return { authorize: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token` };
}

export const redirectUri = (base: string, p: Provider) => `${base}/api/auth/sso/${p}/callback`;

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: randomBytes(16).toString("base64url") };
}

export const SSO_COOKIE = "lms_sso";

/**
 * Reads the email from an ID token received directly from the provider's token endpoint over TLS.
 * Per OpenID Connect Core 3.1.3.7 the TLS connection authenticates the issuer, so the signature
 * check can be skipped; issuer, audience and expiry are still checked here.
 */
export function emailFromIdToken(p: Provider, idToken: string, clientId: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(clientId)) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    const iss = String(payload.iss ?? "");
    if (p === "google") {
      if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") return null;
      if (payload.email_verified !== true) return null;
      return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    }
    if (!/^https:\/\/login\.microsoftonline\.com\/[\w-]+\/v2\.0$/.test(iss)) return null;
    const email = payload.email ?? payload.preferred_username ?? payload.upn;
    return typeof email === "string" && email.includes("@") ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}
