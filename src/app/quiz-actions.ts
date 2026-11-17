"use server";

// Quizzes and exams: settings, question builder, attempts and grading.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { canAccessCourse, requireUser } from "@/lib/auth";
import {
  DEADLINE_GRACE_MS,
  checkQuestions,
  gradeAttempt,
  questionInputSchema,
  quizState,
  shuffle,
  toQuestion,
  type AnswerMap,
  type AwardMap,
} from "@/lib/quiz";
import { attemptQuestions, closeExpiredAttempts, finalizeAttempt } from "@/lib/attempts";
import type { FormState } from "./actions";

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Enter a valid date and time.");

const settingsSchema = z
  .object({
    title: z.string().trim().min(2, "Give it a title.").max(200),
    description: z.string().trim().max(20_000).default(""),
    kind: z.enum(["QUIZ", "EXAM"]).default("QUIZ"),
    timeLimitMin: z
      .string()
      .trim()
      .transform((v) => (v ? Number(v) : null))
      .refine((n) => n === null || (Number.isInteger(n) && n >= 1 && n <= 600), "Use whole minutes from 1 to 600, or leave it empty."),
    maxAttempts: z.coerce.number().int().min(0, "Use 0 for unlimited.").max(50),
    opensAt: optionalDate,
    closesAt: optionalDate,
    showResults: z.enum(["IMMEDIATE", "SCORE_ONLY", "AFTER_CLOSE"]),
    shuffleQuestions: z.enum(["yes", "no"]).transform((v) => v === "yes"),
    drawCount: z
      .string()
      .trim()
      .default("")
      .transform((v) => (v ? Number(v) : null))
      .refine((n) => n === null || (Number.isInteger(n) && n >= 1 && n <= 500), "Use a whole number, or leave it empty for all questions."),
  })
  .refine((d) => !d.opensAt || !d.closesAt || d.closesAt > d.opensAt, { path: ["closesAt"], message: "The close time must be after the open time." })
  .refine((d) => d.showResults !== "AFTER_CLOSE" || d.closesAt, { path: ["closesAt"], message: "Set a close time, or choose another option for results." });

function errorsOf(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

async function manageableQuiz(quizId: string) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const quiz = await db.quiz.findUnique({ where: { id: quizId } });
  if (!quiz || !(await canAccessCourse(user, quiz.courseId)).canManage) return null;
  return quiz;
}

async function moduleIdFor(courseId: string, value: FormDataEntryValue | null) {
  const id = typeof value === "string" ? value : "";
  if (!id) return null;
  return (await db.module.findFirst({ where: { id, courseId }, select: { id: true } }))?.id ?? null;
}

export async function createQuiz(courseId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, courseId)).canManage) return { message: "You can't edit this course." };
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const quiz = await db.quiz.create({ data: { ...parsed.data, courseId, moduleId: await moduleIdFor(courseId, form.get("moduleId")) } });
  redirect(`/courses/${courseId}/quizzes/${quiz.id}/edit?created=1`);
}

export async function updateQuizSettings(quizId: string, _: FormState, form: FormData): Promise<FormState> {
  const quiz = await manageableQuiz(quizId);
  if (!quiz) return { message: "You can't edit this." };
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  await db.quiz.update({ where: { id: quizId }, data: { ...parsed.data, moduleId: await moduleIdFor(quiz.courseId, form.get("moduleId")) } });
  revalidatePath(`/courses/${quiz.courseId}`, "layout");
  return { ok: true, message: "Settings saved." };
}

export type SaveQuestionsResult = { ok: boolean; message: string; errors?: Record<number, string>; ids?: string[] };

/** Saves the whole question list from the builder. Existing question ids are kept so attempts stay linked. */
export async function saveQuizQuestions(quizId: string, payload: string): Promise<SaveQuestionsResult> {
  const quiz = await manageableQuiz(quizId);
  if (!quiz) return { ok: false, message: "You can't edit this." };
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, message: "Something went wrong reading the questions. Reload and try again." };
  }
  const parsed = z.array(questionInputSchema).max(200, "A quiz can have up to 200 questions.").safeParse(raw);
  if (!parsed.success) {
    const errors: Record<number, string> = {};
    for (const i of parsed.error.issues) if (typeof i.path[0] === "number") errors[i.path[0]] ??= i.message;
    return { ok: false, message: "Some questions need fixing.", errors };
  }
  const qs = parsed.data.map((q) => ({
    ...q,
    options: q.type === "TRUE_FALSE"
      ? [{ id: "true", text: "True", correct: q.options.find((o) => o.id === "true")?.correct ?? false }, { id: "false", text: "False", correct: q.options.find((o) => o.id === "false")?.correct ?? false }]
      : q.type === "SINGLE" || q.type === "MULTIPLE" ? q.options.filter((o) => o.text) : [],
    answers: q.type === "SHORT" ? q.answers.filter(Boolean) : [],
  }));
  const errors = checkQuestions(qs);
  if (Object.keys(errors).length) return { ok: false, message: "Some questions need fixing.", errors };

  const existing = await db.question.findMany({ where: { quizId }, select: { id: true } });
  const existingIds = new Set(existing.map((q) => q.id));
  const keepIds = new Set(qs.map((q) => q.id).filter((id): id is string => !!id && existingIds.has(id)));
  const ids = await db.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { quizId, id: { notIn: [...keepIds] } } });
    const out: string[] = [];
    for (const [position, q] of qs.entries()) {
      const data = {
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        position,
        options: q.options as Prisma.InputJsonValue,
        answers: q.answers as Prisma.InputJsonValue,
        explanation: q.explanation,
      };
      const row = q.id && keepIds.has(q.id)
        ? await tx.question.update({ where: { id: q.id }, data, select: { id: true } })
        : await tx.question.create({ data: { ...data, quizId }, select: { id: true } });
      out.push(row.id);
    }
    return out;
  });
  revalidatePath(`/courses/${quiz.courseId}/quizzes/${quizId}`, "layout");
  return { ok: true, message: `Saved ${qs.length} question${qs.length === 1 ? "" : "s"}.`, ids };
}

export async function setQuizPublished(quizId: string, published: boolean) {
  const quiz = await manageableQuiz(quizId);
  if (!quiz) return;
  if (published && !(await db.question.count({ where: { quizId } }))) return;
  await db.quiz.update({ where: { id: quizId }, data: { published } });
  revalidatePath(`/courses/${quiz.courseId}`, "layout");
}

export async function deleteQuiz(quizId: string) {
  const quiz = await manageableQuiz(quizId);
  if (!quiz) return;
  await db.quiz.delete({ where: { id: quizId } });
  revalidatePath(`/courses/${quiz.courseId}`, "layout");
  redirect(`/courses/${quiz.courseId}?tab=quizzes`);
}

/** Re-runs automatic grading on submitted attempts after answers were corrected. Essay marks are kept. */
export async function regradeQuiz(quizId: string) {
  const quiz = await manageableQuiz(quizId);
  if (!quiz) return;
  const questions = (await db.question.findMany({ where: { quizId }, orderBy: { position: "asc" } })).map(toQuestion);
  const essays = new Set(questions.filter((q) => q.type === "ESSAY").map((q) => q.id));
  const attempts = await db.quizAttempt.findMany({ where: { quizId, submittedAt: { not: null } } });
  for (const a of attempts) {
    const prev = (a.awarded ?? {}) as AwardMap;
    const keep = Object.fromEntries(Object.entries(prev).filter(([id]) => essays.has(id)));
    const g = gradeAttempt(attemptQuestions(quiz, questions, (a.questionOrder ?? []) as string[]), (a.answers ?? {}) as AnswerMap, keep);
    await db.quizAttempt.update({ where: { id: a.id }, data: { awarded: g.awarded, score: g.score, maxScore: g.maxScore, needsReview: g.needsReview } });
  }
  revalidatePath(`/courses/${quiz.courseId}`, "layout");
}

/* ---------------- Attempts (students) ---------------- */

export async function startAttempt(quizId: string) {
  const user = await requireUser(["STUDENT"]);
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, include: { questions: { select: { id: true }, orderBy: { position: "asc" } } } });
  if (!quiz || !(await canAccessCourse(user, quiz.courseId)).canView) redirect("/courses");
  const base = `/courses/${quiz.courseId}/quizzes/${quizId}`;
  if (quizState(quiz) !== "open" || !quiz.questions.length) redirect(base);
  await closeExpiredAttempts({ quizId, studentId: user.id });

  const inProgress = await db.quizAttempt.findFirst({ where: { quizId, studentId: user.id, submittedAt: null } });
  if (inProgress) redirect(`${base}/attempts/${inProgress.id}`);
  const used = await db.quizAttempt.count({ where: { quizId, studentId: user.id } });
  if (quiz.maxAttempts > 0 && used >= quiz.maxAttempts) redirect(base);

  const now = Date.now();
  const limits = [quiz.timeLimitMin ? now + quiz.timeLimitMin * 60_000 : null, quiz.closesAt?.getTime() ?? null].filter((n): n is number => n != null);
  const ids = quiz.questions.map((q) => q.id);
  // Random draw: each student gets their own selection (kept in the quiz's order unless shuffling).
  const picked = quiz.drawCount && quiz.drawCount < ids.length ? new Set(shuffle(ids).slice(0, quiz.drawCount)) : null;
  const pool = picked ? ids.filter((id) => picked.has(id)) : ids;
  const attempt = await db.quizAttempt.create({
    data: {
      quizId,
      studentId: user.id,
      deadlineAt: limits.length ? new Date(Math.min(...limits)) : null,
      questionOrder: quiz.shuffleQuestions ? shuffle(pool) : pool,
    },
  });
  redirect(`${base}/attempts/${attempt.id}`);
}

const answersSchema = z.record(z.string().max(40), z.union([z.string().max(20_000), z.array(z.string().max(40)).max(20)]));

async function ownOpenAttempt(attemptId: string) {
  const user = await requireUser(["STUDENT"]);
  const a = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { select: { courseId: true, drawCount: true, questions: { select: { id: true } } } } },
  });
  if (!a || a.studentId !== user.id) return null;
  // Answers are accepted only for this attempt's questions.
  const allowed = a.quiz.drawCount ? ((a.questionOrder ?? []) as string[]) : a.quiz.questions.map((q) => q.id);
  return { ...a, allowed };
}

function cleanAnswers(raw: unknown, questionIds: string[]): AnswerMap {
  const parsed = answersSchema.safeParse(raw);
  if (!parsed.success) return {};
  const allowed = new Set(questionIds);
  return Object.fromEntries(Object.entries(parsed.data).filter(([id]) => allowed.has(id)));
}

export async function saveAttempt(attemptId: string, answers: unknown, focusLost: number): Promise<{ ok: boolean; expired?: boolean; submitted?: boolean }> {
  const a = await ownOpenAttempt(attemptId);
  if (!a) return { ok: false };
  if (a.submittedAt) return { ok: false, submitted: true };
  if (a.deadlineAt && Date.now() > a.deadlineAt.getTime() + DEADLINE_GRACE_MS) return { ok: false, expired: true };
  const clean = cleanAnswers(answers, a.allowed);
  await db.quizAttempt.update({
    where: { id: attemptId },
    data: { answers: clean, focusLost: Math.max(a.focusLost, Math.min(Number(focusLost) || 0, 1000)) },
  });
  return { ok: true };
}

export async function submitAttempt(attemptId: string, answers: unknown, focusLost: number) {
  const a = await ownOpenAttempt(attemptId);
  if (!a) redirect("/courses");
  const url = `/courses/${a.quiz.courseId}/quizzes/${a.quizId}/attempts/${attemptId}`;
  if (!a.submittedAt) {
    const late = a.deadlineAt && Date.now() > a.deadlineAt.getTime() + DEADLINE_GRACE_MS;
    // After the deadline only the answers saved in time count.
    await finalizeAttempt(attemptId, late ? undefined : cleanAnswers(answers, a.allowed), Number(focusLost) || 0);
  }
  revalidatePath(`/courses/${a.quiz.courseId}`, "layout");
  redirect(`${url}?submitted=1`);
}

/* ---------------- Grading (teachers) ---------------- */

export async function gradeAttemptManually(attemptId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const a = await db.quizAttempt.findUnique({ where: { id: attemptId }, include: { quiz: { include: { questions: true } } } });
  if (!a || !(await canAccessCourse(user, a.quiz.courseId)).canManage) return { message: "You can't grade this." };
  if (!a.submittedAt) return { message: "The student hasn't submitted this attempt yet." };
  const questions = attemptQuestions(a.quiz, a.quiz.questions.map(toQuestion), (a.questionOrder ?? []) as string[]);
  const awarded = { ...((a.awarded ?? {}) as AwardMap) };
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const raw = form.get(`q_${q.id}`);
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > q.points) errors[`q_${q.id}`] = `Enter 0 to ${q.points}.`;
    else awarded[q.id] = Math.round(n * 100) / 100;
  }
  if (Object.keys(errors).length) return { errors, message: "Some points are out of range." };
  const answers = (a.answers ?? {}) as AnswerMap;
  const needsReview = questions.some((q) => q.type === "ESSAY" && !(q.id in awarded) && typeof answers[q.id] === "string" && String(answers[q.id]).trim());
  const score = Math.round(Object.values(awarded).reduce((s, n) => s + n, 0) * 100) / 100;
  await db.quizAttempt.update({
    where: { id: attemptId },
    data: { awarded, score, needsReview, feedback: String(form.get("feedback") ?? "").trim() || null },
  });
  revalidatePath(`/courses/${a.quiz.courseId}`, "layout");
  return { ok: true, message: needsReview ? "Saved. Some answers still need points." : "Grades saved." };
}

/* ---------------- Question bank ---------------- */

/** Copies a question from the builder into the school's question bank. */
export async function saveToBank(payload: string, category: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, message: "Something went wrong. Try again." };
  }
  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const errors = checkQuestions([parsed.data]);
  if (errors[0]) return { ok: false, message: errors[0] };
  const q = parsed.data;
  await db.bankQuestion.create({
    data: {
      schoolId: user.schoolId,
      ownerId: user.id,
      category: category.trim().slice(0, 60) || "General",
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      options: q.options as Prisma.InputJsonValue,
      answers: q.answers as Prisma.InputJsonValue,
      explanation: q.explanation,
    },
  });
  revalidatePath("/bank");
  return { ok: true, message: "Saved to the question bank." };
}

export async function deleteBankQuestion(id: string) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  await db.bankQuestion.deleteMany({ where: { id, schoolId: user.schoolId, ...(user.role === "ADMIN" ? {} : { ownerId: user.id }) } });
  revalidatePath("/bank");
}
