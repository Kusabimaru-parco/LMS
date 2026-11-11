import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { SetupWizard, type SystemCheck } from "./setup-wizard";
import pkg from "../../../package.json";

export const metadata: Metadata = { title: "Set up your school" };
export const dynamic = "force-dynamic";

async function systemChecks(): Promise<SystemCheck[]> {
  const checks: SystemCheck[] = [];
  try {
    const [{ version }] = await db.$queryRaw<{ version: string }[]>`SELECT version()`;
    const migrations = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    checks.push({ label: "Database connected", ok: true, detail: version.split(",")[0] });
    checks.push({ label: "Database tables created", ok: true, detail: `${Number(migrations[0].n)} migration(s) applied` });
  } catch {
    checks.push({ label: "Database connected", ok: false, detail: "Check DATABASE_URL and that migrations have run." });
  }
  const secret = process.env.AUTH_SECRET ?? "";
  const strong = secret.length >= 32 && !secret.startsWith("dev-only");
  checks.push({
    label: "Security key configured",
    ok: strong,
    warn: !strong && process.env.NODE_ENV !== "production",
    detail: strong ? "AUTH_SECRET is set" : "Set AUTH_SECRET to a long random value (the installer does this for you).",
  });
  const demo = process.env.DEMO_MODE === "true";
  checks.push({
    label: "Demo mode off",
    ok: !demo,
    detail: demo ? "DEMO_MODE=true shows one-click sign-in buttons. Turn it off for a real school." : "Only real accounts can sign in",
  });
  checks.push({ label: "App version", ok: true, detail: `Campus LMS ${pkg.version} · Node ${process.versions.node}` });
  return checks;
}

export default async function SetupPage() {
  if (await isSetupComplete()) redirect("/login");
  return <SetupWizard checks={await systemChecks()} />;
}
