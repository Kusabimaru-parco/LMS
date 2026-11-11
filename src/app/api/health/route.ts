import { db } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

// Used by Docker healthchecks, uptime monitors and load balancers.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", version: pkg.version, setupComplete: await isSetupComplete() });
  } catch {
    return Response.json({ status: "error", version: pkg.version, error: "database unreachable" }, { status: 503 });
  }
}
