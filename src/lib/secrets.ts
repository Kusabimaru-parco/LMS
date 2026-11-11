// Encrypts integration secrets (SMTP passwords, API keys) before they are stored in the database.
// AES-256-GCM. The key comes from SETTINGS_ENCRYPTION_KEY, or is derived from AUTH_SECRET.
// Changing that key makes stored secrets unreadable, so it must be kept with the backups.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function key() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) throw new Error("AUTH_SECRET (or SETTINGS_ENCRYPTION_KEY) must be set");
  return createHash("sha256").update(raw).digest();
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(value: string) {
  if (!value.startsWith(PREFIX)) return value;
  const buf = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
