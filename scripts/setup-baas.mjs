#!/usr/bin/env node
// Campus LMS setup for managed hosting ("BaaS"): Vercel (or Netlify/Render/Railway) + a managed
// PostgreSQL (Supabase, Neon) + S3-compatible file storage (Supabase Storage, Cloudflare R2, AWS S3).
//
//   npm ci
//   npm run setup:baas
//
// It asks for your database and storage details, generates secrets, checks that the database and
// storage work, creates the tables, and writes deploy/baas/vercel.env for you to import into
// Vercel (Project → Settings → Environment Variables → Import .env). Nothing is uploaded anywhere.
import { createInterface } from "node:readline/promises";
import { randomBytes, randomInt } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { stdin, stdout, exit } from "node:process";
import { AwsClient } from "aws4fetch";

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, def = "") => ((await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim() || def);
const bold = (s) => console.log(`\x1b[1m${s}\x1b[0m`);
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const failNow = (s) => { console.error(`\x1b[31mError:\x1b[0m ${s}`); exit(1); };
const rand = (n) => randomBytes(n * 2).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, n);
const code = () => Array.from({ length: 12 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[randomInt(31)]).join("").replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");

bold("Campus LMS setup for managed hosting (Vercel + Supabase/Neon)\n");

// 1. Database
console.log("1. Database. Supabase: Project → Connect → Session pooler (port 5432). Neon: the connection string.");
const databaseUrl = await ask("PostgreSQL connection string");
if (!/^postgres(ql)?:\/\//.test(databaseUrl)) failNow("That isn't a PostgreSQL connection string (it starts with postgresql://).");
if (/:6543\b/.test(databaseUrl)) console.log("  Note: port 6543 is Supabase's transaction pooler. Use the Session pooler (5432) for Campus LMS.");
try {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl }, shell: process.platform === "win32" });
  ok("Database reachable and tables created");
} catch {
  failNow("Couldn't create the tables. Check the connection string and that the database allows connections from this computer.");
}

// 2. Site address
console.log("\n2. Site address. Your Vercel domain, e.g. https://lms.yourschool.edu or https://your-project.vercel.app");
const appUrl = (await ask("Site address")).replace(/\/+$/, "");
if (!/^https:\/\//.test(appUrl)) failNow("Use the https:// address.");

// 3. File storage
console.log("\n3. File storage (Vercel can't keep uploaded files on its own disk).");
console.log("   Supabase: Storage → create a PRIVATE bucket → Settings → S3 Connection (endpoint, region, access keys).");
console.log("   Cloudflare R2: endpoint https://<account>.r2.cloudflarestorage.com, region auto.");
const s3 = {
  S3_ENDPOINT: (await ask("S3 endpoint")).replace(/\/+$/, ""),
  S3_REGION: await ask("Region", "auto"),
  S3_BUCKET: await ask("Bucket name", "campus-lms"),
  S3_ACCESS_KEY_ID: await ask("Access key ID"),
  S3_SECRET_ACCESS_KEY: await ask("Secret access key"),
};
try {
  const client = new AwsClient({ accessKeyId: s3.S3_ACCESS_KEY_ID, secretAccessKey: s3.S3_SECRET_ACCESS_KEY, service: "s3", region: s3.S3_REGION });
  const url = `${s3.S3_ENDPOINT}/${encodeURIComponent(s3.S3_BUCKET)}/setup-check-${Date.now()}.txt`;
  const put = await client.fetch(url, { method: "PUT", body: "campus-lms" });
  if (!put.ok) throw new Error(`upload returned ${put.status}`);
  const back = await (await client.fetch(url)).text();
  await client.fetch(url, { method: "DELETE" });
  if (back !== "campus-lms") throw new Error("read-back mismatch");
  ok("Storage works (wrote, read and deleted a test file)");
} catch (err) {
  failNow(`Storage check failed: ${err.message}. Check the endpoint, bucket name and keys.`);
}
rl.close();

// 4. Write the environment file
const env = {
  DATABASE_URL: databaseUrl,
  AUTH_SECRET: rand(48),
  SETUP_CODE: code(),
  APP_URL: appUrl,
  CRON_SECRET: rand(40),
  DEMO_MODE: "false",
  STORAGE_DRIVER: "s3",
  ...s3,
  MAX_UPLOAD_MB: "4",
};
mkdirSync("deploy/baas", { recursive: true });
const file = "deploy/baas/vercel.env";
writeFileSync(file, Object.entries(env).map(([k, v]) => `${k}="${v}"`).join("\n") + "\n");
try { chmodSync(file, 0o600); } catch {}
ok(`Wrote ${file} (keep it private; it's in .gitignore)`);

bold("\nNext steps");
console.log(`  1. In Vercel: Add New → Project → import this repository.`);
console.log(`  2. Settings → Environment Variables → Import .env → choose ${file}.`);
console.log(`  3. Deploy. Vercel runs the daily job (/api/cron) using CRON_SECRET automatically.`);
console.log(`  4. Open ${appUrl}/setup and enter the setup code: ${env.SETUP_CODE}`);
console.log(`\nUpdates: push or merge the new release into the branch Vercel deploys. Migrations run during the build.`);
