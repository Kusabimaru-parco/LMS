// Quiz and exam logic shared by the builder, the attempt runner and grading.
import { z } from "zod";

export type QType = "SINGLE" | "MULTIPLE" | "TRUE_FALSE" | "SHORT" | "ESSAY";
export type Option = { id: string; text: string; correct: boolean };
export type QuestionData = {
  id: string;
  type: QType;
  prompt: string;
  points: number;
  options: Option[];
  answers: string[];
  explanation: string;
};
export type AnswerMap = Record<string, string | string[]>;
export type AwardMap = Record<string, number>;

export const QUESTION_TYPES: { id: QType; label: string; hint: string }[] = [
  { id: "SINGLE", label: "Multiple choice", hint: "One correct answer" },
  { id: "MULTIPLE", label: "Checkboxes", hint: "One or more correct answers, partial credit" },
  { id: "TRUE_FALSE", label: "True or false", hint: "Two options" },
  { id: "SHORT", label: "Short answer", hint: "Graded against accepted answers" },
  { id: "ESSAY", label: "Essay", hint: "You grade it by hand" },
];
export const typeLabel = (t: string) => QUESTION_TYPES.find((q) => q.id === t)?.label ?? t;

export const SHOW_RESULTS = [
  { value: "IMMEDIATE", label: "Score and answers right after submitting" },
  { value: "SCORE_ONLY", label: "Score only" },
  { value: "AFTER_CLOSE", label: "Score and answers after the close date" },
];

/** Normalizes rows from the database (options/answers are JSON columns). */
export function toQuestion(q: { id: string; type: string; prompt: string; points: number; options: unknown; answers: unknown; explanation: string }): QuestionData {
  return {
    id: q.id,
    type: q.type as QType,
    prompt: q.prompt,
    points: q.points,
    options: Array.isArray(q.options) ? (q.options as Option[]) : [],
    answers: Array.isArray(q.answers) ? (q.answers as string[]) : [],
    explanation: q.explanation,
  };
}

/** What a student sees while answering: no correct flags, accepted answers or explanations. */
export function publicQuestion(q: QuestionData) {
  return { id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: q.options.map(({ id, text }) => ({ id, text })) };
}
export type PublicQuestion = ReturnType<typeof publicQuestion>;

const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");

/** Points for one answer, or null when a teacher has to grade it (essays). */
export function gradeQuestion(q: QuestionData, answer: string | string[] | undefined): number | null {
  if (q.type === "ESSAY") return typeof answer === "string" && answer.trim() ? null : 0;
  if (q.type === "SHORT") {
    if (typeof answer !== "string" || !answer.trim()) return 0;
    return q.answers.some((a) => norm(a) === norm(answer)) ? q.points : 0;
  }
  if (q.type === "MULTIPLE") {
    const picked = new Set(Array.isArray(answer) ? answer : []);
    const correct = q.options.filter((o) => o.correct);
    if (!correct.length) return 0;
    const right = correct.filter((o) => picked.has(o.id)).length;
    const wrong = q.options.filter((o) => !o.correct && picked.has(o.id)).length;
    return Math.round(Math.max(0, (right - wrong) / correct.length) * q.points * 100) / 100;
  }
  const id = Array.isArray(answer) ? answer[0] : answer;
  return q.options.find((o) => o.id === id)?.correct ? q.points : 0;
}

/**
 * Grades a whole attempt. `keep` holds points a teacher already gave by hand; they win over
 * automatic grading for that question.
 */
export function gradeAttempt(questions: QuestionData[], answers: AnswerMap, keep: AwardMap = {}) {
  const awarded: AwardMap = {};
  let needsReview = false;
  for (const q of questions) {
    if (q.id in keep) {
      awarded[q.id] = keep[q.id];
      continue;
    }
    const pts = gradeQuestion(q, answers[q.id]);
    if (pts == null) needsReview = true;
    else awarded[q.id] = pts;
  }
  const score = Object.values(awarded).reduce((s, n) => s + n, 0);
  const maxScore = questions.reduce((s, q) => s + q.points, 0);
  return { awarded, score: Math.round(score * 100) / 100, maxScore, needsReview };
}

export function isAnswered(a: string | string[] | undefined) {
  return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 0;
}

type QuizTiming = { opensAt: Date | null; closesAt: Date | null; published: boolean };
export function quizState(q: QuizTiming, now = new Date()): "draft" | "upcoming" | "open" | "closed" {
  if (!q.published) return "draft";
  if (q.opensAt && now < q.opensAt) return "upcoming";
  if (q.closesAt && now > q.closesAt) return "closed";
  return "open";
}

export function resultsVisible(q: { showResults: string; closesAt: Date | null }, now = new Date()) {
  if (q.showResults === "IMMEDIATE") return { score: true, answers: true };
  if (q.showResults === "SCORE_ONLY") return { score: true, answers: false };
  const closed = !!q.closesAt && now > q.closesAt;
  return { score: closed, answers: closed };
}

/** Grace period after the deadline for answers in flight (slow connections). */
export const DEADLINE_GRACE_MS = 60_000;

/* ---------------- Builder validation ---------------- */

const optionSchema = z.object({ id: z.string().min(1).max(40), text: z.string().trim().max(1000), correct: z.boolean() });
export const questionInputSchema = z.object({
  id: z.string().max(40).optional(),
  type: z.enum(["SINGLE", "MULTIPLE", "TRUE_FALSE", "SHORT", "ESSAY"]),
  prompt: z.string().trim().min(1, "Write the question.").max(5000),
  points: z.coerce.number().int("Use whole points.").min(0).max(1000),
  options: z.array(optionSchema).max(12).default([]),
  answers: z.array(z.string().trim().max(300)).max(20).default([]),
  explanation: z.string().trim().max(3000).default(""),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Checks that each question can actually be answered and graded. Returns an error per question index. */
export function checkQuestions(qs: QuestionInput[]) {
  const errors: Record<number, string> = {};
  qs.forEach((q, i) => {
    const opts = q.options.filter((o) => o.text);
    if (q.type === "SINGLE" || q.type === "MULTIPLE") {
      if (opts.length < 2) errors[i] = "Add at least two answer options.";
      else if (!opts.some((o) => o.correct)) errors[i] = "Mark the correct answer.";
      else if (q.type === "SINGLE" && opts.filter((o) => o.correct).length > 1) errors[i] = "Multiple choice has one correct answer. Use Checkboxes for more.";
    }
    if (q.type === "TRUE_FALSE" && q.options.filter((o) => o.correct).length !== 1) errors[i] = "Choose whether the statement is true or false.";
    if (q.type === "SHORT" && !q.answers.filter(Boolean).length) errors[i] = "Add at least one accepted answer.";
  });
  return errors;
}

export function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function formatScore(n: number | null | undefined) {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
