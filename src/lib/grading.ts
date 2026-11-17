// Grade calculation shared by the gradebook, student grades, report cards, parent views,
// weekly summaries and the insights dashboard. Supports category weights (assignments / quizzes / exams).
import { db } from "./db";
import { bestAttempts } from "./attempts";
import { letterGrade } from "./utils";

export type Category = "assignment" | "quiz" | "exam";
export type Weights = Partial<Record<Category, number>>;
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "assignment", label: "Assignments" },
  { id: "quiz", label: "Quizzes" },
  { id: "exam", label: "Exams" },
];

/** Weights from a JSON column. null = no weights (plain points-based average). */
export function parseWeights(raw: unknown): Weights | null {
  if (!raw || typeof raw !== "object") return null;
  const w: Weights = {};
  for (const c of CATEGORIES) {
    const n = Number((raw as Record<string, unknown>)[c.id]);
    if (Number.isFinite(n) && n > 0) w[c.id] = n;
  }
  return Object.keys(w).length ? w : null;
}

/** A course's own setting wins (an empty object means "points-based"); null falls back to the school's. */
export const courseWeights = (course: unknown, school: unknown) => (course != null ? parseWeights(course) : parseWeights(school));

export type GradeItem = { category: Category; score: number | null; points: number };

/** Average percentage. With weights, each category's percentage counts by its weight (only categories with grades). */
export function average(items: GradeItem[], weights: Weights | null): number | null {
  const graded = items.filter((i) => i.score != null && i.points > 0);
  if (!graded.length) return null;
  const pointsBased = () => Math.round((graded.reduce((s, i) => s + i.score!, 0) / graded.reduce((s, i) => s + i.points, 0)) * 100);
  if (!weights) return pointsBased();
  let total = 0;
  let sum = 0;
  for (const c of CATEGORIES) {
    const list = graded.filter((i) => i.category === c.id);
    const w = weights[c.id] ?? 0;
    if (!list.length || !w) continue;
    sum += w * (list.reduce((s, i) => s + i.score!, 0) / list.reduce((s, i) => s + i.points, 0));
    total += w;
  }
  return total ? Math.round((sum / total) * 100) : pointsBased();
}

export const weightsLabel = (w: Weights | null) =>
  w ? CATEGORIES.filter((c) => w[c.id]).map((c) => `${c.label} ${w[c.id]}%`).join(" · ") : "Points-based (every point counts the same)";

type Period = { startsAt: Date; endsAt: Date } | null | undefined;
const inPeriod = (d: Date, p: Period) => !p || (d >= p.startsAt && d <= p.endsAt);

/**
 * Per-course grades for one student: items, average, letter and missing work.
 * Only items due inside the period count when a period is given.
 */
export async function studentGrades(studentId: string, opts: { courseIds?: string[]; period?: Period } = {}) {
  const now = new Date();
  const courses = await db.course.findMany({
    where: { enrollments: { some: { userId: studentId } }, ...(opts.courseIds ? { id: { in: opts.courseIds } } : {}) },
    orderBy: { title: "asc" },
    include: {
      school: { select: { gradeWeights: true } },
      teacher: { select: { name: true } },
      assignments: { select: { id: true, title: true, dueAt: true, points: true, submissions: { where: { studentId }, select: { score: true, gradedAt: true, submittedAt: true } } } },
      quizzes: {
        where: { published: true },
        select: {
          id: true, title: true, kind: true, closesAt: true, createdAt: true,
          attempts: { where: { studentId, submittedAt: { not: null } }, select: { quizId: true, studentId: true, score: true, maxScore: true, submittedAt: true, needsReview: true } },
        },
      },
    },
  });

  return courses.map((c) => {
    const weights = courseWeights(c.gradeWeights, c.school.gradeWeights);
    const items = [
      ...c.assignments.filter((a) => inPeriod(a.dueAt, opts.period)).map((a) => {
        const s = a.submissions[0];
        return {
          id: a.id, kind: "assignment" as const, category: "assignment" as Category, title: a.title, due: a.dueAt, points: a.points,
          score: s?.gradedAt ? s.score : null, submitted: !!s, missing: !s && a.dueAt < now,
          href: `/courses/${c.id}/assignments/${a.id}`,
        };
      }),
      ...c.quizzes.filter((q) => inPeriod(q.closesAt ?? q.createdAt, opts.period)).map((q) => {
        const best = bestAttempts(q.attempts).get(`${q.id}:${studentId}`);
        return {
          id: q.id, kind: "quiz" as const, category: (q.kind === "EXAM" ? "exam" : "quiz") as Category, title: q.title, due: q.closesAt ?? q.createdAt,
          points: best?.maxScore ?? 0, score: best && !best.needsReview ? best.score : null, submitted: !!best,
          missing: !best && !!q.closesAt && q.closesAt < now, href: `/courses/${c.id}/quizzes/${q.id}`,
        };
      }),
    ].sort((a, b) => a.due.getTime() - b.due.getTime());
    const avg = average(items, weights);
    return { course: { id: c.id, title: c.title, code: c.code, color: c.color, teacher: c.teacher?.name ?? null }, items, weights, avg, letter: letterGrade(avg), missing: items.filter((i) => i.missing) };
  });
}

export type AttendanceCounts = { PRESENT: number; LATE: number; ABSENT: number; EXCUSED: number; total: number };
const emptyCounts = (): AttendanceCounts => ({ PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, total: 0 });

/** Attendance counts per course (and overall) for one student. */
export async function attendanceSummary(studentId: string, opts: { from?: Date; to?: Date; courseIds?: string[] } = {}) {
  const rows = await db.attendance.findMany({
    where: { studentId, date: { gte: opts.from, lte: opts.to }, ...(opts.courseIds ? { courseId: { in: opts.courseIds } } : {}) },
    select: { courseId: true, status: true },
  });
  const byCourse = new Map<string, AttendanceCounts>();
  const all = emptyCounts();
  for (const r of rows) {
    const c = byCourse.get(r.courseId) ?? emptyCounts();
    const k = r.status as keyof Omit<AttendanceCounts, "total">;
    if (k in c) {
      c[k]++;
      all[k]++;
    }
    c.total++;
    all.total++;
    byCourse.set(r.courseId, c);
  }
  return { byCourse, all };
}

export const ATTENDANCE = [
  { id: "PRESENT", label: "Present", short: "P", tone: "success" },
  { id: "LATE", label: "Late", short: "L", tone: "warning" },
  { id: "ABSENT", label: "Absent", short: "A", tone: "danger" },
  { id: "EXCUSED", label: "Excused", short: "E", tone: "neutral" },
] as const;
