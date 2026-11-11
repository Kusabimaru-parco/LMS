// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "lms_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = { userId: string; schoolId: string; role: Role };
export type Role = "ADMIN" | "TEACHER" | "STUDENT";

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET must be set (16+ chars)");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

/**
 * Whether the current request came in over HTTPS (directly or via a proxy such as Caddy or Vercel).
 * Session cookies are marked "secure" only then: browsers drop secure cookies on plain http://,
 * which would make sign-in impossible on a LAN install without a domain.
 */
export async function requestIsHttps() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return (process.env.APP_URL ?? "").startsWith("https://");
}
