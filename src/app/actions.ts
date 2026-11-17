"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessCourse, getCurrentUser, requireUser } from "@/lib/auth";
import { SESSION_COOKIE, requestIsHttps, sessionCookieOptions, signSession, type Role } from "@/lib/session";
import { readLogo, schoolSchema } from "@/lib/school";
import { generateTempPassword, hashToken, newResetToken, passwordSchema, rateLimited, RESET_TOKEN_MINUTES } from "@/lib/passwords";
import { isEmailConfigured, parseEmailForm, saveEmailConfig } from "@/lib/email";
import { sendResetLinkEmail, sendTempPasswordEmail, sendTestEmail, sendWelcomeEmail } from "@/lib/notifications";
import { setSetting } from "@/lib/settings";
import { APP_URL_KEY, clientIp, normalizeSiteUrl, safeRedirectPath } from "@/lib/url";
import { assignJoinCode, normalizeJoinCode } from "@/lib/codes";
import { deleteStoredFile } from "@/lib/storage";
import { randomBytes } from "node:crypto";
import { CATEGORIES } from "@/lib/grading";

/** `code` is a value to show once in a copyable box (e.g. a temporary password when email is off). */
export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string>; code?: string } | undefined;

function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

/* ---------------- Auth ---------------- */

async function startSession(user: { id: string; schoolId: string; role: string }) {
  const token = await signSession({ userId: user.id, schoolId: user.schoolId, role: user.role as Role });
  (await cookies()).set(SESSION_COOKIE, token, { ...sessionCookieOptions, secure: await requestIsHttps() });
}


const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  // Per account (stops guessing one person's password, even from many IPs) and per IP (stops trying many accounts).
  const ip = await clientIp();
  if (rateLimited(`login-email:${parsed.data.email}`, 10, 15 * 60_000) || rateLimited(`login-ip:${ip}`, 40, 15 * 60_000))
    return { message: "Too many sign-in attempts. Wait 15 minutes, or reset your password." };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok) return { message: "That email and password don't match. Please try again." };
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user);
  if (user.mustChangePassword) redirect("/change-password");
  redirect(safeRedirectPath(String(form.get("next") ?? "")));
}

/** One-click demo sign-in. Only works when DEMO_MODE=true. */
export async function demoLogin(form: FormData) {
  if (process.env.DEMO_MODE !== "true") redirect("/login");
  const email = { ADMIN: "admin@northfield.edu", TEACHER: "teacher@northfield.edu", STUDENT: "student@northfield.edu", PARENT: "parent@northfield.edu" }[
    String(form.get("role")) as Role
  ];
  const user = email && (await db.user.findUnique({ where: { email } }));
  if (!user) redirect("/login");
  await startSession(user);
  redirect("/dashboard");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/** Ends every session of this account (lost phone, shared computer), then signs this browser back in. */
export async function signOutEverywhere() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { passwordChangedAt: new Date() } });
  await startSession(user);
  revalidatePath("/account");
  redirect("/account?signedOut=1");
}

/** "Forgot password": emails a one-time link. Always answers the same way so it can't reveal who has an account. */
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.string().trim().toLowerCase().email("Enter a valid email address.").safeParse(form.get("email"));
  if (!parsed.success) return { errors: { email: parsed.error.issues[0].message } };
  if (!(await isEmailConfigured()))
    return { message: "Password reset by email isn't turned on at this school. Ask your school administrator to reset your password." };
  const email = parsed.data;
  const done: FormState = {
    ok: true,
    message: `If ${email} has an account, we've sent it a link to choose a new password. It works for ${RESET_TOKEN_MINUTES} minutes. Check your spam folder if it doesn't arrive.`,
  };
  const ip = await clientIp();
  if (rateLimited(`reset-ip:${ip}`, 10, 15 * 60_000) || rateLimited(`reset-email:${email}`, 3, 60 * 60_000)) return done;

  const user = await db.user.findUnique({ where: { email }, include: { school: { select: { name: true, brandColor: true } } } });
  if (!user) return done;
  await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
  const { token, tokenHash } = newResetToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000) },
  });
  // Sent in the background so the response takes the same time whether or not the account exists.
  void sendResetLinkEmail(user, user.school, token)
    .then((r) => !r.ok && console.error(`[campus-lms] Password reset email failed: ${r.error}`))
    .catch((err) => console.error("[campus-lms] Password reset email failed:", err));
  return done;
}

const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "The passwords don't match." });

export async function resetPassword(token: string, _: FormState, form: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date())
    return { message: "This reset link has expired or was already used. Ask for a new one." };
  const now = new Date();
  await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash: await bcrypt.hash(parsed.data.password, 10), passwordChangedAt: now, mustChangePassword: false, lastLoginAt: now },
    }),
    db.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
  ]);
  await startSession(row.user);
  redirect("/dashboard?passwordChanged=1");
}

/** Change your own password. Not asked for the current one only right after signing in with a temporary password. */
export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!user.mustChangePassword) {
    const current = String(form.get("current") ?? "");
    if (!current) return { errors: { current: "Enter your current password." } };
    if (!(await bcrypt.compare(current, row.passwordHash))) return { errors: { current: "That isn't your current password." } };
  }
  if (await bcrypt.compare(parsed.data.password, row.passwordHash))
    return { errors: { password: "Choose a password that's different from your current one." } };
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10), passwordChangedAt: new Date(), mustChangePassword: false },
  });
  await startSession(user); // the old session is now invalid, so issue a new one
  if (user.mustChangePassword) redirect("/dashboard?passwordChanged=1");
  return { ok: true, message: "Your password was changed. You've been signed out on other devices." };
}

/* ---------------- Profile ---------------- */

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Your name is required.").max(120),
      phone: z.string().trim().max(40).default(""),
      bio: z.string().trim().max(500, "Keep it under 500 characters.").default(""),
    })
    .safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const file = form.get("avatar");
  let avatar: { avatar: Buffer | null; avatarMime: string | null; avatarUpdatedAt: Date | null } | object = {};
  if (file instanceof File && file.size > 0) {
    if (!AVATAR_TYPES.includes(file.type)) return { errors: { avatar: "Use a PNG, JPG or WebP picture." } };
    if (file.size > 1024 * 1024) return { errors: { avatar: "The picture must be smaller than 1 MB." } };
    avatar = { avatar: Buffer.from(await file.arrayBuffer()), avatarMime: file.type, avatarUpdatedAt: new Date() };
  } else if (form.get("removeAvatar") === "on") {
    avatar = { avatar: null, avatarMime: null, avatarUpdatedAt: null };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      bio: parsed.data.bio || null,
      emailReminders: form.get("emailReminders") === "on",
      ...avatar,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Your profile was saved." };
}

/** Creates (or replaces) the secret link for subscribing to your LMS calendar. */
export async function resetCalendarFeed() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { calendarToken: randomBytes(24).toString("base64url") } });
  revalidatePath("/account");
}

export async function removeCalendarFeed() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { calendarToken: null } });
  revalidatePath("/account");
}

/* ---------------- Courses ---------------- */

const courseSchema = z.object({
  title: z.string().trim().min(2, "Course title is required."),
  code: z.string().trim().min(2, "Course code is required.").max(16, "Keep the code under 16 characters."),
  description: z.string().trim().max(1000).default(""),
  color: z.string().default("indigo"),
  teacherId: z.string().optional(),
});

export async function createCourse(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const parsed = courseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { teacherId, ...data } = parsed.data;
  let teacher = user.role === "TEACHER" ? user.id : teacherId || null;
  if (teacher && user.role === "ADMIN") {
    const t = await db.user.findFirst({ where: { id: teacher, schoolId: user.schoolId, role: "TEACHER" } });
    if (!t) teacher = null;
  }
  const course = await db.course.create({ data: { ...data, code: data.code.toUpperCase(), schoolId: user.schoolId, teacherId: teacher } });
  await assignJoinCode(course.id);
  revalidatePath("/courses");
  redirect(`/courses/${course.id}`);
}

export async function updateCourse(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, courseId)).canManage) return { message: "You can't edit this course." };
  const parsed = courseSchema.omit({ teacherId: true }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  await db.course.update({ where: { id: courseId }, data: { ...parsed.data, code: parsed.data.code.toUpperCase() } });
  revalidatePath(`/courses/${courseId}`, "layout");
  return { ok: true, message: "Course details saved." };
}

export async function updateCourseWeights(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, courseId)).canManage) return { message: "You can't edit this course." };
  // mode: "inherit" = school default (null), "points" = every point the same ({}), "weighted" = weights
  const mode = String(form.get("mode") ?? "inherit");
  let gradeWeights: Record<string, number> | null = mode === "points" ? {} : null;
  if (mode === "weighted") {
    gradeWeights = {};
    for (const c of CATEGORIES) {
      const n = Number(form.get(`w_${c.id}`) || 0);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { errors: { [`w_${c.id}`]: "Use 0 to 100." } };
      if (n) gradeWeights[c.id] = n;
    }
    if (!Object.keys(gradeWeights).length) return { errors: { w_assignment: "Give at least one category a weight, or use the school default." } };
  }
  await db.course.update({ where: { id: courseId }, data: { gradeWeights: gradeWeights ?? Prisma.DbNull } });
  revalidatePath(`/courses/${courseId}`, "layout");
  revalidatePath("/grades");
  return { ok: true, message: "Grading for this course saved." };
}

export async function joinCourse(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["STUDENT"]);
  const code = normalizeJoinCode(String(form.get("code") ?? ""));
  if (code.length < 4) return { errors: { code: "Enter the class code your teacher gave you." } };
  if (rateLimited(`join:${user.id}`, 10, 10 * 60_000)) return { message: "Too many tries. Wait a few minutes and try again." };
  const course = await db.course.findFirst({ where: { joinCode: code, schoolId: user.schoolId }, select: { id: true, title: true, joinEnabled: true } });
  if (!course) return { errors: { code: "No class has that code. Check it with your teacher." } };
  if (!course.joinEnabled) return { errors: { code: "This class isn't accepting new students right now. Ask your teacher." } };
  await db.enrollment.upsert({
    where: { userId_courseId: { userId: user.id, courseId: course.id } },
    update: {},
    create: { userId: user.id, courseId: course.id },
  });
  revalidatePath("/courses");
  redirect(`/courses/${course.id}?joined=1`);
}

export async function newJoinCode(courseId: string) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, courseId)).canManage) return;
  await assignJoinCode(courseId);
  revalidatePath(`/courses/${courseId}`);
}

export async function setJoinEnabled(courseId: string, enabled: boolean) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, courseId)).canManage) return;
  await db.course.update({ where: { id: courseId }, data: { joinEnabled: enabled } });
  revalidatePath(`/courses/${courseId}`);
}

export async function enrollStudents(courseId: string, form: FormData) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const { canManage } = await canAccessCourse(user, courseId);
  if (!canManage) return;
  const ids = form.getAll("studentId").map(String);
  const valid = await db.user.findMany({ where: { id: { in: ids }, schoolId: user.schoolId, role: "STUDENT" }, select: { id: true } });
  for (const s of valid) {
    await db.enrollment.upsert({
      where: { userId_courseId: { userId: s.id, courseId } },
      update: {},
      create: { userId: s.id, courseId },
    });
  }
  revalidatePath(`/courses/${courseId}`);
}

export async function unenrollStudent(courseId: string, studentId: string) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const { canManage } = await canAccessCourse(user, courseId);
  if (!canManage) return;
  await db.enrollment.deleteMany({ where: { courseId, userId: studentId } });
  revalidatePath(`/courses/${courseId}`);
}

/* ---------------- Modules ---------------- */

/** Loads a module the user may manage, or null. */
async function manageableModule(moduleId: string) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const m = await db.module.findUnique({ where: { id: moduleId }, select: { id: true, courseId: true, position: true } });
  if (!m || !(await canAccessCourse(user, m.courseId)).canManage) return null;
  return m;
}

const moduleSchema = z.object({
  title: z.string().trim().min(2, "Give the module a title.").max(200),
  description: z.string().trim().max(20_000).default(""),
});

export async function updateModule(moduleId: string, _: FormState, form: FormData): Promise<FormState> {
  const m = await manageableModule(moduleId);
  if (!m) return { message: "You can't edit this module." };
  const parsed = moduleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  await db.module.update({ where: { id: moduleId }, data: parsed.data });
  revalidatePath(`/courses/${m.courseId}`, "layout");
  return { ok: true, message: "Module saved." };
}

export async function deleteModule(moduleId: string) {
  const m = await manageableModule(moduleId);
  if (!m) return;
  const files = await db.material.findMany({ where: { moduleId, fileId: { not: null } }, select: { file: { select: { id: true, storageKey: true } } } });
  await db.$transaction([
    db.module.delete({ where: { id: moduleId } }),
    db.storedFile.deleteMany({ where: { id: { in: files.map((f) => f.file!.id) } } }),
  ]);
  await Promise.all(files.map((f) => deleteStoredFile(f.file!.storageKey)));
  revalidatePath(`/courses/${m.courseId}`, "layout");
  redirect(`/courses/${m.courseId}`);
}

export async function moveModule(moduleId: string, direction: "up" | "down") {
  const m = await manageableModule(moduleId);
  if (!m) return;
  const all = await db.module.findMany({ where: { courseId: m.courseId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = all.findIndex((x) => x.id === moduleId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((x, pos) => db.module.update({ where: { id: x.id }, data: { position: pos } })));
  revalidatePath(`/courses/${m.courseId}`, "layout");
}

export async function deleteMaterial(materialId: string) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const mat = await db.material.findUnique({ where: { id: materialId }, include: { module: { select: { courseId: true } }, file: true } });
  if (!mat || !(await canAccessCourse(user, mat.module.courseId)).canManage) return;
  if (mat.file) {
    await db.storedFile.delete({ where: { id: mat.file.id } }); // cascades to the material
    await deleteStoredFile(mat.file.storageKey);
  } else {
    await db.material.delete({ where: { id: materialId } });
  }
  revalidatePath(`/courses/${mat.module.courseId}`, "layout");
}

export async function toggleModuleComplete(courseId: string, moduleId: string) {
  const user = await requireUser(["STUDENT"]);
  if (!(await canAccessCourse(user, courseId)).canView) return;
  const m = await db.module.findFirst({ where: { id: moduleId, courseId }, select: { id: true } });
  if (!m) return;
  const key = { userId_moduleId: { userId: user.id, moduleId } };
  if (await db.moduleCompletion.findUnique({ where: key })) await db.moduleCompletion.delete({ where: key });
  else await db.moduleCompletion.create({ data: { userId: user.id, moduleId } });
  revalidatePath(`/courses/${courseId}`, "layout");
}

/** A module id from a form, if it belongs to this course. */
async function moduleIdFor(courseId: string, value: FormDataEntryValue | null) {
  const id = typeof value === "string" ? value : "";
  if (!id) return null;
  const m = await db.module.findFirst({ where: { id, courseId }, select: { id: true } });
  return m?.id ?? null;
}

/* ---------------- Attendance ---------------- */

const STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

export async function saveAttendance(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, courseId)).canManage) return { message: "You can't take attendance for this course." };
  const dateStr = String(form.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { message: "Choose a date." };
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (date.getTime() > Date.now() + 86_400_000) return { message: "You can't take attendance for a future date." };
  const enrolled = await db.enrollment.findMany({ where: { courseId }, select: { userId: true } });
  let count = 0;
  for (const { userId } of enrolled) {
    const status = String(form.get(`s_${userId}`) ?? "");
    if (!STATUSES.includes(status)) continue;
    const note = String(form.get(`n_${userId}`) ?? "").trim().slice(0, 200);
    await db.attendance.upsert({
      where: { courseId_studentId_date: { courseId, studentId: userId, date } },
      update: { status, note, recordedById: user.id },
      create: { courseId, studentId: userId, date, status, note, recordedById: user.id },
    });
    count++;
  }
  revalidatePath(`/courses/${courseId}`);
  return { ok: true, message: `Attendance saved for ${count} student${count === 1 ? "" : "s"}.` };
}

/* ---------------- Lessons ---------------- */

const lessonSchema = z.object({
  title: z.string().trim().min(2, "Lesson title is required."),
  content: z.string().trim().min(1, "Add some lesson content."),
});

export async function createLesson(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const { canManage } = await canAccessCourse(user, courseId);
  if (!canManage) return { message: "You can't edit this course." };
  const parsed = lessonSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const moduleId = await moduleIdFor(courseId, form.get("moduleId"));
  const count = await db.lesson.count({ where: { courseId } });
  const lesson = await db.lesson.create({ data: { ...parsed.data, courseId, moduleId, position: count } });
  redirect(`/courses/${courseId}/lessons/${lesson.id}`);
}

export async function toggleLessonComplete(courseId: string, lessonId: string) {
  const user = await requireUser();
  const { canView } = await canAccessCourse(user, courseId);
  if (!canView) return;
  if (!(await db.lesson.findFirst({ where: { id: lessonId, courseId }, select: { id: true } }))) return;
  const key = { userId_lessonId: { userId: user.id, lessonId } };
  const existing = await db.lessonProgress.findUnique({ where: key });
  if (existing) await db.lessonProgress.delete({ where: key });
  else await db.lessonProgress.create({ data: { userId: user.id, lessonId } });
  revalidatePath(`/courses/${courseId}`, "layout");
}

/* ---------------- Assignments ---------------- */

const assignmentSchema = z.object({
  title: z.string().trim().min(2, "Assignment title is required."),
  instructions: z.string().trim().min(1, "Add instructions for students."),
  dueAt: z.coerce.date({ error: "Choose a due date and time." }),
  points: z.coerce.number().int().min(1, "Points must be at least 1.").max(1000),
});

export async function createAssignment(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const { canManage } = await canAccessCourse(user, courseId);
  if (!canManage) return { message: "You can't edit this course." };
  const parsed = assignmentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const moduleId = await moduleIdFor(courseId, form.get("moduleId"));
  const a = await db.assignment.create({ data: { ...parsed.data, courseId, moduleId } });
  redirect(`/courses/${courseId}/assignments/${a.id}`);
}

export async function removeSubmissionAttachment(attachmentId: string) {
  const user = await requireUser(["STUDENT"]);
  const att = await db.submissionAttachment.findUnique({
    where: { id: attachmentId },
    include: { file: true, submission: { select: { studentId: true, gradedAt: true, assignmentId: true, assignment: { select: { courseId: true } } } } },
  });
  if (!att || att.submission.studentId !== user.id || att.submission.gradedAt) return;
  if (att.file) {
    await db.storedFile.delete({ where: { id: att.file.id } });
    await deleteStoredFile(att.file.storageKey);
  } else {
    await db.submissionAttachment.delete({ where: { id: attachmentId } });
  }
  revalidatePath(`/courses/${att.submission.assignment.courseId}/assignments/${att.submission.assignmentId}`);
}

const rubricSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(40),
      title: z.string().trim().min(1, "Every criterion needs a name.").max(200),
      levels: z
        .array(z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1, "Every level needs a name.").max(100), points: z.coerce.number().int().min(0).max(1000), description: z.string().trim().max(500).default("") }))
        .min(2, "Each criterion needs at least two levels.")
        .max(8),
    }),
  )
  .max(20);
export type RubricCriterion = z.infer<typeof rubricSchema>[number];

/** Saves an assignment's rubric. The assignment's points become the rubric's maximum. */
export async function setRubric(assignmentId: string, payload: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, select: { courseId: true } });
  if (!a || !(await canAccessCourse(user, a.courseId)).canManage) return { ok: false, message: "You can't edit this assignment." };
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, message: "Something went wrong. Reload and try again." };
  }
  const parsed = rubricSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const max = parsed.data.reduce((s, c) => s + Math.max(...c.levels.map((l) => l.points)), 0);
  await db.assignment.update({
    where: { id: assignmentId },
    data: { rubric: parsed.data, ...(parsed.data.length ? { points: Math.max(1, max) } : {}) },
  });
  revalidatePath(`/courses/${a.courseId}`, "layout");
  return { ok: true, message: parsed.data.length ? `Rubric saved. The assignment is now out of ${max} points.` : "Rubric removed." };
}

export async function gradeSubmission(submissionId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const sub = await db.submission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
  if (!sub) return { message: "Submission not found." };
  const { canManage } = await canAccessCourse(user, sub.assignment.courseId);
  if (!canManage) return { message: "You can't grade this course." };
  const rubric = rubricSchema.safeParse(sub.assignment.rubric);
  let score: number;
  let rubricScores: Record<string, string> = {};
  if (rubric.success && rubric.data.length) {
    score = 0;
    for (const c of rubric.data) {
      const level = c.levels.find((l) => l.id === form.get(`r_${c.id}`));
      if (!level) return { errors: { [`r_${c.id}`]: "Choose a level." }, message: `Choose a level for "${c.title}".` };
      rubricScores[c.id] = level.id;
      score += level.points;
    }
  } else {
    score = Number(form.get("score"));
    rubricScores = {};
    if (!Number.isFinite(score) || score < 0 || score > sub.assignment.points)
      return { errors: { score: `Enter a score from 0 to ${sub.assignment.points}.` } };
  }
  await db.submission.update({
    where: { id: submissionId },
    data: { score: Math.round(score), rubricScores, feedback: String(form.get("feedback") ?? "").trim() || null, gradedAt: new Date() },
  });
  revalidatePath(`/courses/${sub.assignment.courseId}`, "layout");
  return { ok: true, message: "Grade saved." };
}

/* ---------------- Announcements ---------------- */

export async function postAnnouncement(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const { canManage } = await canAccessCourse(user, courseId);
  if (!canManage) return { message: "You can't post in this course." };
  const parsed = z
    .object({ title: z.string().trim().min(2, "Add a title."), body: z.string().trim().min(1, "Write a message.") })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  await db.announcement.create({ data: { ...parsed.data, courseId, authorId: user.id } });
  revalidatePath(`/courses/${courseId}`);
  return { ok: true, message: "Announcement posted." };
}

/* ---------------- Calendar ---------------- */

const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Give the event a title.").max(200),
    description: z.string().trim().max(5000).default(""),
    location: z.string().trim().max(200).default(""),
    allDay: z.enum(["yes", "no"]).default("no").transform((v) => v === "yes"),
    startsAt: z.coerce.date({ error: "Choose when it starts." }),
    endsAt: z
      .string()
      .trim()
      .transform((v) => (v ? new Date(v) : null))
      .refine((d) => d === null || !Number.isNaN(d.getTime()), "Enter a valid end time."),
    courseId: z.string().default(""),
  })
  .refine((d) => !d.endsAt || d.endsAt >= d.startsAt, { path: ["endsAt"], message: "The end must be after the start." });

export async function createEvent(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { courseId, ...data } = parsed.data;
  if (courseId) {
    if (!(await canAccessCourse(user, courseId)).canManage) return { errors: { courseId: "Choose one of your courses." } };
  } else if (user.role !== "ADMIN") {
    return { errors: { courseId: "Choose the class this event is for." } };
  }
  await db.event.create({ data: { ...data, courseId: courseId || null, schoolId: user.schoolId, createdById: user.id } });
  revalidatePath("/calendar");
  return { ok: true, message: "Event added to the calendar." };
}

export async function deleteEvent(eventId: string) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const ev = await db.event.findFirst({ where: { id: eventId, schoolId: user.schoolId } });
  if (!ev) return;
  const allowed = ev.courseId ? (await canAccessCourse(user, ev.courseId)).canManage : user.role === "ADMIN";
  if (!allowed) return;
  await db.event.delete({ where: { id: eventId } });
  revalidatePath("/calendar");
}

/* ---------------- Admin: people ---------------- */

const userSchema = z.object({
  name: z.string().trim().min(2, "Full name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  gradeLevel: z.string().trim().optional(),
  children: z.string().trim().optional(),
});

/** Students (by email) a parent should be linked to. Returns an error message for unknown emails. */
async function findChildren(schoolId: string, emails: string | undefined) {
  const list = (emails ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return { ids: [] as string[] };
  const found = await db.user.findMany({ where: { schoolId, role: "STUDENT", email: { in: list } }, select: { id: true, email: true } });
  const missing = list.filter((e) => !found.some((f) => f.email === e));
  if (missing.length) return { error: `No student account for ${missing.join(", ")}.` };
  return { ids: found.map((f) => f.id) };
}

export async function createUser(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { gradeLevel, children, ...data } = parsed.data;
  if (await db.user.findUnique({ where: { email: data.email } }))
    return { errors: { email: "Someone already uses this email." } };
  const kids = data.role === "PARENT" ? await findChildren(admin.schoolId, children) : { ids: [] as string[] };
  if ("error" in kids) return { errors: { children: kids.error! } };
  const temp = generateTempPassword();
  await db.user.create({
    data: {
      ...data,
      gradeLevel: data.role === "STUDENT" ? gradeLevel || null : null,
      schoolId: admin.schoolId,
      passwordHash: await bcrypt.hash(temp, 10),
      mustChangePassword: true,
      children: { create: kids.ids!.map((studentId) => ({ studentId })) },
    },
  });
  revalidatePath("/admin/users");
  const sent = await sendWelcomeEmail(data, admin.school, temp);
  if (sent.ok) return { ok: true, message: `${data.name} was added. We emailed them a temporary password, and they'll choose their own when they first sign in.` };
  return {
    ok: true,
    message: `${data.name} was added, but ${sent.error === "Email isn't set up." ? "email isn't set up" : "the welcome email couldn't be sent"}. Give them this temporary password privately. They'll choose their own when they first sign in.`,
    code: temp,
  };
}

export async function resetUserPassword(userId: string, _: FormState): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const user = await db.user.findFirst({ where: { id: userId, schoolId: admin.schoolId } });
  if (!user) return { message: "That person wasn't found." };
  if (user.id === admin.id) return { message: "Change your own password from My account." };
  const temp = generateTempPassword();
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(temp, 10), mustChangePassword: true, passwordChangedAt: new Date() },
  });
  await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
  const sent = await sendTempPasswordEmail(user, admin.school, temp);
  if (sent.ok) return { ok: true, message: `We emailed ${user.name} a temporary password.` };
  return { ok: true, message: `Password reset for ${user.name}. Email isn't available, so give them this temporary password privately:`, code: temp };
}

export async function deleteUser(userId: string) {
  const admin = await requireUser(["ADMIN"]);
  if (userId === admin.id) return;
  await db.user.deleteMany({ where: { id: userId, schoolId: admin.schoolId } });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/* ---------------- Admin: school and email settings ---------------- */

export async function updateSchool(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = schoolSchema.safeParse(fields);
  const logo = await readLogo(form.get("logo"));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (logo && "error" in logo) return { errors: { logo: logo.error } };

  const logoData =
    logo && !("error" in logo)
      ? { logo: logo.bytes, logoMime: logo.mime, logoUpdatedAt: new Date() }
      : form.get("removeLogo") === "on"
        ? { logo: null, logoMime: null, logoUpdatedAt: null }
        : {};
  await db.school.update({ where: { id: admin.schoolId }, data: { ...parsed.data, ...logoData } });
  revalidatePath("/", "layout");
  return { ok: true, message: "School settings saved." };
}

export async function saveEmailSettings(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const siteUrl = normalizeSiteUrl(String(form.get("siteUrl") ?? ""));
  if (!siteUrl) return { errors: { siteUrl: "Enter the address people use to open the LMS, e.g. https://lms.school.edu" } };
  const parsed = await parseEmailForm(form);
  if ("errors" in parsed) return { errors: parsed.errors, message: "Some details need fixing." };
  await saveEmailConfig({ ...parsed.config, fromName: parsed.config.fromName || admin.school.name });
  await setSetting(APP_URL_KEY, siteUrl);
  revalidatePath("/admin/settings/email");
  return {
    ok: true,
    message: parsed.config.provider === "none" ? "Saved. Email is turned off." : "Email settings saved. Send a test email to check them.",
  };
}

export async function sendTestEmailAction(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = await parseEmailForm(form);
  if ("errors" in parsed) return { errors: parsed.errors, message: "Fix the highlighted fields first." };
  if (parsed.config.provider === "none") return { message: "Choose how to send email first." };
  if (rateLimited(`test-email:${admin.id}`, 10, 10 * 60_000)) return { message: "Too many test emails. Wait a few minutes." };
  const r = await sendTestEmail(admin.email, admin.school, parsed.config);
  return r.ok ? { ok: true, message: `Test email sent to ${admin.email}. Check the inbox (and spam folder).` } : { message: r.error };
}
