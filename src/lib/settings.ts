// Install-wide settings and first-run setup state.
import { randomInt, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { decrypt, encrypt } from "./secrets";

export const KEYS = {
  setupCompletedAt: "setup.completedAt",
  setupCode: "setup.code",
} as const;

export async function getSetting(key: string) {
  const row = await db.systemSetting.findUnique({ where: { key } });
  if (!row) return null;
  return row.secret ? decrypt(row.value) : row.value;
}

export async function setSetting(key: string, value: string, opts: { secret?: boolean } = {}) {
  const stored = opts.secret ? encrypt(value) : value;
  await db.systemSetting.upsert({
    where: { key },
    update: { value: stored, secret: !!opts.secret },
    create: { key, value: stored, secret: !!opts.secret },
  });
}

let setupDoneCache = false;

/** True once the first-run wizard has finished. Never flips back, so it is cached in memory. */
export async function isSetupComplete() {
  if (setupDoneCache) return true;
  const done = (await getSetting(KEYS.setupCompletedAt)) !== null;
  if (done) setupDoneCache = true;
  return done;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

function newCode() {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/**
 * The one-time setup code that proves the person running the wizard controls the server.
 * Uses SETUP_CODE from the environment if the installer set one, otherwise a stored random code.
 */
export async function getOrCreateSetupCode() {
  if (process.env.SETUP_CODE) return process.env.SETUP_CODE.trim().toUpperCase();
  const existing = await getSetting(KEYS.setupCode);
  if (existing) return existing;
  const code = newCode();
  await setSetting(KEYS.setupCode, code, { secret: true });
  return code;
}

export async function verifySetupCode(input: string) {
  const expected = Buffer.from(await getOrCreateSetupCode());
  const given = Buffer.from(input.trim().toUpperCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function printSetupBanner() {
  if (await isSetupComplete()) return;
  const code = await getOrCreateSetupCode();
  const line = "=".repeat(60);
  console.log(
    `\n${line}\n  Campus LMS is not set up yet.\n  Open the site in your browser and go to /setup\n  Setup code: ${code}\n${line}\n`,
  );
}
