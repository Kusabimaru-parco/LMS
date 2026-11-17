// The site's public address, used for links in emails.
// Order: APP_URL env → address saved at setup / in School settings → the current request's host.
// Links in password emails never trust the request's Host header when an address is saved.
import { headers } from "next/headers";
import { getSetting } from "./settings";

export const APP_URL_KEY = "app.url";

export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return host ? `${proto}://${host}` : null;
}

export async function getBaseUrl() {
  const url = process.env.APP_URL || (await getSetting(APP_URL_KEY)) || (await requestOrigin()) || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

/**
 * The client's IP for rate limiting. Uses the right-most X-Forwarded-For entry: the address our own
 * reverse proxy (Caddy, IIS, Vercel) saw. Left-most entries are supplied by the client and can be faked.
 */
export async function clientIp() {
  const h = await headers();
  const chain = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return chain[chain.length - 1] || h.get("x-real-ip") || "local";
}

/**
 * A safe place to go after signing in: only a path on this site.
 * Rejects "//evil.com", "/\\evil.com" (browsers treat "\" as "/"), schemes and control characters.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || /[\\\x00-\x1f]/.test(next) || next.startsWith("//")) return fallback;
  try {
    const u = new URL(next, "http://localhost");
    return u.origin === "http://localhost" ? `${u.pathname}${u.search}${u.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeSiteUrl(input: string) {
  const v = input.trim().replace(/\/+$/, "");
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `http://${v}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
