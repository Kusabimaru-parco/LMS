import { db } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

// Used by Docker healthchecks, uptime monitors and load balancers.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", version: APP_VERSION, setupComplete: await isSetupComplete() });
  } catch {
    return Response.json({ status: "error", version: APP_VERSION, error: "database unreachable" }, { status: 503 });
  }
}
