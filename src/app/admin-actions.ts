"use server";

// Administrator actions: people (edit, parents, CSV import), email templates, grading setup, sign-in providers.
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { normalizeJoinCode } from "@/lib/codes";
import { generateTempPassword } from "@/lib/passwords";
import { sendTemplateTest, sendWelcomeEmail } from "@/lib/notifications";
import { isEmailConfigured } from "@/lib/email";
import { TEMPLATE_KEYS, sampleVariables, type TemplateKey } from "@/lib/email-templates";
import { CATEGORIES } from "@/lib/grading";
import { PROVIDERS, saveSsoConfig, type Provider } from "@/lib/sso";
import type { FormState } from "./actions";

function errorsOf(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

/* ---------------- People ---------------- */

const editUserSchema = z.object({
  name: z.string().trim().min(2, "Full name is required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  gradeLevel: z.string().trim().max(40).default(""),
});

export async function updateUser(userId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const user = await db.user.findFirst({ where: { id: userId, schoolId: admin.schoolId } });
  if (!user) return { message: "That person wasn't found." };
  const parsed = editUserSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  if (user.id === admin.id && parsed.data.role !== "ADMIN") return { errors: { role: "You can't remove your own administrator role." } };
  if (parsed.data.email !== user.email && (await db.user.findUnique({ where: { email: parsed.data.email } })))
    return { errors: { email: "Someone already uses this email." } };
  await db.user.update({
    where: { id: userId },
    data: { ...parsed.data, gradeLevel: parsed.data.role === "STUDENT" ? parsed.data.gradeLevel || null : null },
  });
  revalidatePath("/admin/users", "layout");
  return { ok: true, message: "Saved." };
}

export async function linkChild(parentId: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const email = String(form.get("childEmail") ?? "").trim().toLowerCase();
  const [parent, child] = await Promise.all([
    db.user.findFirst({ where: { id: parentId, schoolId: admin.schoolId, role: "PARENT" } }),
    db.user.findFirst({ where: { email, schoolId: admin.schoolId, role: "STUDENT" } }),
  ]);
  if (!parent) return { message: "Only parent accounts can have children linked." };
  if (!child) return { errors: { childEmail: "No student has that email." } };
  await db.parentLink.upsert({ where: { parentId_studentId: { parentId, studentId: child.id } }, update: {}, create: { parentId, studentId: child.id } });
  revalidatePath(`/admin/users/${parentId}`);
  return { ok: true, message: `${child.name} is linked.` };
}

export async function unlinkChild(parentId: string, studentId: string) {
  const admin = await requireUser(["ADMIN"]);
  const parent = await db.user.findFirst({ where: { id: parentId, schoolId: admin.schoolId } });
  if (!parent) return;
  await db.parentLink.deleteMany({ where: { parentId, studentId } });
  revalidatePath(`/admin/users/${parentId}`);
}

/* ---------------- CSV import ---------------- */

export type ImportRow = {
  line: number;
  name: string;
  email: string;
  role: string;
  gradeLevel: string;
  classCodes: string[];
  parentName: string;
  parentEmail: string;
  problems: string[];
  exists: boolean;
};
export type ImportState = {
  rows?: ImportRow[];
  message?: string;
  ok?: boolean;
  done?: { created: number; enrolled: number; parents: number; emailed: number; credentials: { name: string; email: string; role: string; password: string }[] };
};

const HEADERS: Record<string, keyof ImportRow> = {
  name: "name", "full name": "name", fullname: "name",
  email: "email", "e-mail": "email",
  role: "role", type: "role",
  grade: "gradeLevel", "grade level": "gradeLevel", grade_level: "gradeLevel", gradelevel: "gradeLevel", section: "gradeLevel",
  class: "classCodes", classes: "classCodes", "class code": "classCodes", "class codes": "classCodes", class_codes: "classCodes", class_code: "classCodes",
  "parent name": "parentName", parent_name: "parentName", guardian: "parentName", "guardian name": "parentName",
  "parent email": "parentEmail", parent_email: "parentEmail", "guardian email": "parentEmail",
};
const ROLE_ALIASES: Record<string, string> = { student: "STUDENT", teacher: "TEACHER", admin: "ADMIN", administrator: "ADMIN", parent: "PARENT", guardian: "PARENT" };

async function readImport(schoolId: string, text: string): Promise<{ rows: ImportRow[] } | { message: string }> {
  const table = parseCsv(text);
  if (table.length < 2) return { message: "Add a header row and at least one person." };
  if (table.length > 2001) return { message: "Import up to 2,000 people at a time." };
  const header = table[0].map((h) => HEADERS[h.trim().toLowerCase()]);
  if (!header.includes("name") || !header.includes("email")) return { message: "The first row must name the columns, including name and email." };

  const codes = new Map((await db.course.findMany({ where: { schoolId, joinCode: { not: null } }, select: { joinCode: true } })).map((c) => [c.joinCode!, true]));
  const seen = new Set<string>();
  const rows: ImportRow[] = table.slice(1).map((cells, i) => {
    const get = (k: keyof ImportRow) => (cells[header.indexOf(k)] ?? "").trim();
    const row: ImportRow = {
      line: i + 2,
      name: get("name"),
      email: get("email").toLowerCase(),
      role: ROLE_ALIASES[get("role").toLowerCase()] ?? (get("role") ? "" : "STUDENT"),
      gradeLevel: get("gradeLevel"),
      classCodes: get("classCodes").split(/[\s,;|]+/).map(normalizeJoinCode).filter(Boolean),
      parentName: get("parentName"),
      parentEmail: get("parentEmail").toLowerCase(),
      problems: [],
      exists: false,
    };
    if (row.name.length < 2) row.problems.push("Missing name");
    if (!z.string().email().safeParse(row.email).success) row.problems.push("Invalid email");
    if (!row.role) row.problems.push(`Unknown role "${get("role")}"`);
    if (seen.has(row.email)) row.problems.push("Email appears twice in the file");
    seen.add(row.email);
    for (const c of row.classCodes) if (!codes.has(c)) row.problems.push(`No class with code ${c}`);
    if (row.parentEmail && !z.string().email().safeParse(row.parentEmail).success) row.problems.push("Invalid parent email");
    if (row.parentEmail && row.role !== "STUDENT") row.problems.push("Only students can have a parent");
    return row;
  });
  const existing = new Set((await db.user.findMany({ where: { email: { in: rows.map((r) => r.email) } }, select: { email: true } })).map((u) => u.email));
  for (const r of rows) r.exists = existing.has(r.email);
  return { rows };
}

export async function previewImport(_: ImportState, form: FormData): Promise<ImportState> {
  const admin = await requireUser(["ADMIN"]);
  const r = await readImport(admin.schoolId, String(form.get("csv") ?? ""));
  return "message" in r ? { message: r.message } : { rows: r.rows };
}

export async function runImport(_: ImportState, form: FormData): Promise<ImportState> {
  const admin = await requireUser(["ADMIN"]);
  const r = await readImport(admin.schoolId, String(form.get("csv") ?? ""));
  if ("message" in r) return { message: r.message };
  if (r.rows.some((x) => x.problems.length)) return { rows: r.rows, message: "Fix the rows marked in red, then import again." };

  const emailOn = await isEmailConfigured();
  const courses = new Map((await db.course.findMany({ where: { schoolId: admin.schoolId }, select: { id: true, joinCode: true } })).map((c) => [c.joinCode, c.id]));
  const done: NonNullable<ImportState["done"]> = { created: 0, enrolled: 0, parents: 0, emailed: 0, credentials: [] };

  async function ensureUser(name: string, email: string, role: string, gradeLevel: string | null) {
    const found = await db.user.findUnique({ where: { email } });
    if (found) return found.schoolId === admin.schoolId ? found : null;
    const password = generateTempPassword();
    const u = await db.user.create({
      data: { name, email, role, gradeLevel, schoolId: admin.schoolId, passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
    });
    if (role === "PARENT") done.parents++;
    else done.created++;
    const sent = emailOn ? await sendWelcomeEmail(u, admin.school, password) : { ok: false };
    if (sent.ok) done.emailed++;
    else done.credentials.push({ name, email, role, password });
    return u;
  }

  for (const row of r.rows) {
    const u = await ensureUser(row.name, row.email, row.role, row.role === "STUDENT" ? row.gradeLevel || null : null);
    if (!u) continue;
    for (const code of row.classCodes) {
      const courseId = courses.get(code);
      if (!courseId || u.role !== "STUDENT") continue;
      const e = await db.enrollment.upsert({ where: { userId_courseId: { userId: u.id, courseId } }, update: {}, create: { userId: u.id, courseId } });
      if (e) done.enrolled++;
    }
    if (row.parentEmail && u.role === "STUDENT") {
      const p = await ensureUser(row.parentName || `Parent of ${row.name}`, row.parentEmail, "PARENT", null);
      if (p && p.role === "PARENT") {
        await db.parentLink.upsert({ where: { parentId_studentId: { parentId: p.id, studentId: u.id } }, update: {}, create: { parentId: p.id, studentId: u.id } });
      }
    }
  }
  revalidatePath("/admin/users");
  return { ok: true, done };
}

/* ---------------- Email templates ---------------- */

const templateSchema = z.object({
  name: z.string().trim().min(1, "Give this draft a name.").max(100),
  subject: z.string().trim().min(1, "Write a subject.").max(200),
  heading: z.string().trim().min(1, "Write a heading.").max(200),
  body: z.string().trim().min(1, "Write the message.").max(10_000),
  buttonLabel: z.string().trim().max(60).default(""),
});

const isKey = (k: string): k is TemplateKey => (TEMPLATE_KEYS as string[]).includes(k);

export async function saveTemplate(key: string, id: string | null, _: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  if (!isKey(key)) return { message: "Unknown email type." };
  const parsed = templateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const useNow = form.get("intent") === "use";
  let saved;
  if (id) {
    const existing = await db.emailTemplate.findFirst({ where: { id, key } });
    if (!existing) return { message: "That draft no longer exists." };
    saved = await db.emailTemplate.update({ where: { id }, data: parsed.data });
  } else {
    saved = await db.emailTemplate.create({ data: { ...parsed.data, key } });
  }
  if (useNow) {
    await db.$transaction([
      db.emailTemplate.updateMany({ where: { key, NOT: { id: saved.id } }, data: { active: false } }),
      db.emailTemplate.update({ where: { id: saved.id }, data: { active: true } }),
    ]);
  }
  revalidatePath("/admin/settings/templates", "layout");
  if (!id) redirect(`/admin/settings/templates/${key}?draft=${saved.id}&saved=${useNow ? "used" : "draft"}`);
  return { ok: true, message: useNow ? "Saved. This template is now used for every email of this type." : "Draft saved. It isn't used until you choose \"Save and use\"." };
}

/** Use a custom template (id) or go back to the built-in default (null). */
export async function applyTemplate(key: string, id: string | null) {
  await requireUser(["ADMIN"]);
  if (!isKey(key)) return;
  await db.$transaction([
    db.emailTemplate.updateMany({ where: { key }, data: { active: false } }),
    ...(id ? [db.emailTemplate.updateMany({ where: { key, id }, data: { active: true } })] : []),
  ]);
  revalidatePath("/admin/settings/templates", "layout");
}

export async function deleteTemplate(key: string, id: string) {
  await requireUser(["ADMIN"]);
  await db.emailTemplate.deleteMany({ where: { id, key } });
  revalidatePath("/admin/settings/templates", "layout");
  redirect(`/admin/settings/templates/${key}`);
}

export async function testTemplate(key: string, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  if (!isKey(key)) return { message: "Unknown email type." };
  if (!(await isEmailConfigured())) return { message: "Set up email first (School settings → Email)." };
  const parsed = templateSchema.safeParse({ ...Object.fromEntries(form), name: "test" });
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const r = await sendTemplateTest(key, parsed.data, admin, admin.school, sampleVariables(key));
  return r.ok ? { ok: true, message: `Test sent to ${admin.email} with sample details.` } : { message: r.error };
}

/* ---------------- Grading setup ---------------- */

export async function saveGradeWeights(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const weights: Record<string, number> = {};
  if (form.get("mode") === "weighted") {
    for (const c of CATEGORIES) {
      const n = Number(form.get(`w_${c.id}`) || 0);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { errors: { [`w_${c.id}`]: "Use 0 to 100." } };
      if (n) weights[c.id] = n;
    }
    if (!Object.keys(weights).length) return { errors: { w_assignment: "Give at least one category a weight." } };
  }
  await db.school.update({ where: { id: admin.schoolId }, data: { gradeWeights: weights } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Grading saved. Averages everywhere now use it." };
}

const periodSchema = z
  .object({
    name: z.string().trim().min(1, "Name the period, e.g. Quarter 1.").max(60),
    startsAt: z.coerce.date({ error: "Choose a start date." }),
    endsAt: z.coerce.date({ error: "Choose an end date." }),
  })
  .refine((d) => d.endsAt > d.startsAt, { path: ["endsAt"], message: "The end must be after the start." });

export async function addGradingPeriod(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = periodSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const end = new Date(parsed.data.endsAt);
  end.setHours(23, 59, 59, 999);
  await db.gradingPeriod.create({ data: { ...parsed.data, endsAt: end, schoolId: admin.schoolId } });
  revalidatePath("/admin/settings/grading");
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function deleteGradingPeriod(id: string) {
  const admin = await requireUser(["ADMIN"]);
  await db.gradingPeriod.deleteMany({ where: { id, schoolId: admin.schoolId } });
  revalidatePath("/admin/settings/grading");
}

/* ---------------- Sign-in providers ---------------- */

export async function saveSsoSettings(provider: string, _: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  if (!PROVIDERS.some((p) => p.id === provider)) return { message: "Unknown provider." };
  const clientId = String(form.get("clientId") ?? "").trim();
  const clientSecret = String(form.get("clientSecret") ?? "").trim();
  const tenant = String(form.get("tenant") ?? "").trim();
  if (clientId && clientId.length < 8) return { errors: { clientId: "That doesn't look like a client ID." } };
  if (tenant && !/^[\w.-]+$/.test(tenant)) return { errors: { tenant: "Use a tenant ID or domain, e.g. yourschool.onmicrosoft.com" } };
  await saveSsoConfig(provider as Provider, { clientId, clientSecret, tenant });
  revalidatePath("/admin/settings/sign-in");
  revalidatePath("/login");
  return { ok: true, message: clientId ? "Saved. The sign-in button appears on the sign-in page once a secret is saved." : "Turned off." };
}
