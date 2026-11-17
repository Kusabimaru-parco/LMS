// Password rules, temporary passwords, reset tokens and simple rate limiting.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "That password is too long.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/i/l

/** Easy to read and type, e.g. "kq7m-9tdp-x2wa". Always has a letter and a number. */
export function generateTempPassword() {
  for (;;) {
    const s = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (/[a-z]/.test(s) && /[0-9]/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  }
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export const RESET_TOKEN_MINUTES = 60;

/** In-memory limiter: at most `max` hits per `windowMs` for each key. Resets when the server restarts. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    return false;
  }
  b.count++;
  return b.count > max;
}
