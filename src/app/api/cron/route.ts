// For hosts without a long-running server (Vercel): call this every 15 minutes with
// "Authorization: Bearer <CRON_SECRET>". Self-hosted installs run the same jobs automatically.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret ?? "");
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runJobs());
}
