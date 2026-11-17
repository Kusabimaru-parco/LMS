// Server-only helpers for quiz attempts (not server actions, so browsers can't call them directly).
import { db } from "./db";
import { DEADLINE_GRACE_MS, gradeAttempt, toQuestion, type AnswerMap, type QuestionData } from "./quiz";

/**
 * The questions in one attempt, in the student's order. With random draws only the drawn ones;
 * otherwise every question (including any added after the attempt started, at the end).
 */
export function attemptQuestions(quiz: { drawCount: number | null }, all: QuestionData[], order: string[]) {
  const ordered = order.map((id) => all.find((q) => q.id === id)).filter((q): q is QuestionData => !!q);
  return quiz.drawCount ? ordered : [...ordered, ...all.filter((q) => !order.includes(q.id))];
}

/** Grades and submits an attempt. With no `answers`, the last autosaved answers are used. */
export async function finalizeAttempt(attemptId: string, answers?: AnswerMap, focusLost?: number) {
  const a = await db.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { quiz: { select: { drawCount: true } } } });
  if (a.submittedAt) return a;
  const all = (await db.question.findMany({ where: { quizId: a.quizId } })).map(toQuestion);
  const questions = attemptQuestions(a.quiz, all, (a.questionOrder ?? []) as string[]);
  const final = answers ?? ((a.answers ?? {}) as AnswerMap);
  const g = gradeAttempt(questions, final);
  const now = new Date();
  return db.quizAttempt.update({
    where: { id: attemptId },
    data: {
      answers: final,
      awarded: g.awarded,
      score: g.score,
      maxScore: g.maxScore,
      needsReview: g.needsReview,
      submittedAt: a.deadlineAt && now > a.deadlineAt ? a.deadlineAt : now,
      ...(focusLost != null ? { focusLost: Math.max(a.focusLost, Math.min(focusLost, 1000)) } : {}),
    },
  });
}

/** Submits attempts whose time ran out while the student was away. Call before showing quiz state. */
export async function closeExpiredAttempts(where: { quizId?: string; studentId?: string }) {
  const open = await db.quizAttempt.findMany({
    where: { ...where, submittedAt: null, deadlineAt: { lt: new Date(Date.now() - DEADLINE_GRACE_MS) } },
    select: { id: true },
  });
  for (const a of open) await finalizeAttempt(a.id);
}

/** Best submitted score per (quiz, student). */
export function bestAttempts<T extends { quizId: string; studentId: string; score: number | null; submittedAt: Date | null }>(attempts: T[]) {
  const best = new Map<string, T>();
  for (const a of attempts) {
    if (!a.submittedAt) continue;
    const k = `${a.quizId}:${a.studentId}`;
    const cur = best.get(k);
    if (!cur || (a.score ?? 0) > (cur.score ?? 0)) best.set(k, a);
  }
  return best;
}
