"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { SESSION_COOKIE, requestIsHttps, sessionCookieOptions, signSession, type Role } from "@/lib/session";
import { readLogo, schoolSchema } from "@/lib/school";

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string> } | undefined;

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
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok) return { message: "That email and password don't match. Please try again." };
  await startSession(user);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

/** One-click demo sign-in. Only works when DEMO_MODE=true. */
export async function demoLogin(form: FormData) {
  if (process.env.DEMO_MODE !== "true") redirect("/login");
  const email = { ADMIN: "admin@northfield.edu", TEACHER: "teacher@northfield.edu", STUDENT: "student@northfield.edu" }[
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
  revalidatePath("/courses");
  redirect(`/courses/${course.id}`);
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
  const count = await db.lesson.count({ where: { courseId } });
  const lesson = await db.lesson.create({ data: { ...parsed.data, courseId, position: count } });
  redirect(`/courses/${courseId}/lessons/${lesson.id}`);
}

export async function toggleLessonComplete(courseId: string, lessonId: string) {
  const user = await requireUser();
  const { canView } = await canAccessCourse(user, courseId);
  if (!canView) return;
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
  dueAt: z.coerce.date({ errorMap: () => ({ message: "Choose a due date and time." }) }),
  points: z.coerce.number().int().min(1, "Points must be at least 1.").max(1000),
});

export async function createAssignment(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const { canManage } = await canAccessCourse(user, courseId);
  if (!canManage) return { message: "You can't edit this course." };
  const parsed = assignmentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const a = await db.assignment.create({ data: { ...parsed.data, courseId } });
  redirect(`/courses/${courseId}/assignments/${a.id}`);
}

export async function submitAssignment(assignmentId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["STUDENT"]);
  const content = String(form.get("content") ?? "").trim();
  if (!content) return { errors: { content: "Write your answer before submitting." } };
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, select: { courseId: true } });
  if (!a) return { message: "Assignment not found." };
  const { canView } = await canAccessCourse(user, a.courseId);
  if (!canView) return { message: "You're not enrolled in this course." };
  const existing = await db.submission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: user.id } } });
  if (existing?.gradedAt) return { message: "This work has already been graded and can't be changed." };
  await db.submission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
    update: { content, submittedAt: new Date() },
    create: { assignmentId, studentId: user.id, content },
  });
  revalidatePath(`/courses/${a.courseId}/assignments/${assignmentId}`);
  return { ok: true, message: "Your work was submitted." };
}

export async function gradeSubmission(submissionId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const sub = await db.submission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
  if (!sub) return { message: "Submission not found." };
  const { canManage } = await canAccessCourse(user, sub.assignment.courseId);
  if (!canManage) return { message: "You can't grade this course." };
  const score = Number(form.get("score"));
  if (!Number.isFinite(score) || score < 0 || score > sub.assignment.points)
    return { errors: { score: `Enter a score from 0 to ${sub.assignment.points}.` } };
  await db.submission.update({
    where: { id: submissionId },
    data: { score: Math.round(score), feedback: String(form.get("feedback") ?? "").trim() || null, gradedAt: new Date() },
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

/* ---------------- Admin ---------------- */

const userSchema = z.object({
  name: z.string().trim().min(2, "Full name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
  gradeLevel: z.string().trim().optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function createUser(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { password, gradeLevel, ...data } = parsed.data;
  if (await db.user.findUnique({ where: { email: data.email } }))
    return { errors: { email: "Someone already uses this email." } };
  await db.user.create({
    data: {
      ...data,
      gradeLevel: data.role === "STUDENT" ? gradeLevel || null : null,
      schoolId: admin.schoolId,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `${data.name} was added.` };
}

export async function deleteUser(userId: string) {
  const admin = await requireUser(["ADMIN"]);
  if (userId === admin.id) return;
  await db.user.deleteMany({ where: { id: userId, schoolId: admin.schoolId } });
  revalidatePath("/admin/users");
}

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
