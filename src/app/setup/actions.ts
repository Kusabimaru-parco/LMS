"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { KEYS, isSetupComplete, setSetting, verifySetupCode } from "@/lib/settings";
import { readLogo, schoolSchema } from "@/lib/school";
import { SESSION_COOKIE, requestIsHttps, sessionCookieOptions, signSession } from "@/lib/session";
import type { FormState } from "../actions";

// Simple in-memory brake against guessing the setup code.
const attempts = { count: 0, resetAt: 0 };
function tooManyAttempts() {
  const now = Date.now();
  if (now > attempts.resetAt) Object.assign(attempts, { count: 0, resetAt: now + 15 * 60_000 });
  return ++attempts.count > 10;
}

export async function checkSetupCode(code: string): Promise<{ ok: boolean; message?: string }> {
  if (await isSetupComplete()) return { ok: false, message: "Setup is already complete." };
  if (tooManyAttempts()) return { ok: false, message: "Too many attempts. Wait 15 minutes and try again." };
  if (!(await verifySetupCode(code))) return { ok: false, message: "That setup code isn't right. Check the server logs and try again." };
  return { ok: true };
}

const adminSchema = z
  .object({
    adminName: z.string().trim().min(2, "Your full name is required."),
    adminEmail: z.string().trim().toLowerCase().email("Enter a valid email address."),
    adminPassword: z
      .string()
      .min(10, "Use at least 10 characters.")
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/[0-9]/, "Include at least one number."),
    adminPasswordConfirm: z.string(),
  })
  .refine((d) => d.adminPassword === d.adminPasswordConfirm, { path: ["adminPasswordConfirm"], message: "The passwords don't match." });

function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "school";
}

export async function completeSetup(_: FormState, form: FormData): Promise<FormState> {
  if (await isSetupComplete()) redirect("/login");
  if (!(await verifySetupCode(String(form.get("setupCode") ?? ""))))
    return { message: "The setup code is no longer valid. Go back to step 1 and enter it again." };

  const data = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const school = schoolSchema.safeParse(data);
  const admin = adminSchema.safeParse(data);
  const logo = await readLogo(form.get("logo"));

  const errors: Record<string, string> = {};
  for (const r of [school, admin]) if (!r.success) for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  if (logo && "error" in logo) errors.logo = logo.error;
  if (Object.keys(errors).length) return { errors, message: "Some details need fixing. The steps with problems are marked." };
  if (!school.success || !admin.success) return { message: "Please check the form." };

  const passwordHash = await bcrypt.hash(admin.data.adminPassword, 12);
  const logoData = logo && !("error" in logo) ? { logo: logo.bytes, logoMime: logo.mime, logoUpdatedAt: new Date() } : {};

  const user = await db.$transaction(async (tx) => {
    if (await tx.school.count()) throw new Error("Setup was already completed by someone else.");
    const s = await tx.school.create({ data: { ...school.data, ...logoData, slug: slugify(school.data.name) } });
    const u = await tx.user.create({
      data: { schoolId: s.id, name: admin.data.adminName, email: admin.data.adminEmail, role: "ADMIN", passwordHash },
    });
    await tx.systemSetting.deleteMany({ where: { key: KEYS.setupCode } });
    return u;
  });
  await setSetting(KEYS.setupCompletedAt, new Date().toISOString());

  const token = await signSession({ userId: user.id, schoolId: user.schoolId, role: "ADMIN" });
  (await cookies()).set(SESSION_COOKIE, token, { ...sessionCookieOptions, secure: await requestIsHttps() });
  redirect("/dashboard?welcome=1");
}
