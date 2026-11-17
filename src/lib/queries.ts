import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";

/** Courses visible to a user, scoped to their school and role. */
export function courseScope(user: CurrentUser): Prisma.CourseWhereInput {
  if (user.role === "ADMIN") return { schoolId: user.schoolId };
  if (user.role === "TEACHER") return { schoolId: user.schoolId, teacherId: user.id };
  if (user.role === "PARENT") return { schoolId: user.schoolId, enrollments: { some: { user: { parents: { some: { parentId: user.id } } } } } };
  return { schoolId: user.schoolId, enrollments: { some: { userId: user.id } } };
}

export async function getCourses(user: CurrentUser) {
  const courses = await db.course.findMany({
    where: courseScope(user),
    orderBy: { title: "asc" },
    include: {
      teacher: { select: { name: true } },
      _count: { select: { enrollments: true, lessons: true, assignments: true, quizzes: { where: { published: true } } } },
    },
  });
  if (user.role !== "STUDENT") return courses.map((c) => ({ ...c, progress: 0 }));

  // Progress = lessons read + assignments handed in + quizzes taken, out of everything in the course.
  const ids = courses.map((c) => c.id);
  const [lessons, subs, attempts] = await Promise.all([
    db.lessonProgress.findMany({ where: { userId: user.id, lesson: { courseId: { in: ids } } }, select: { lesson: { select: { courseId: true } } } }),
    db.submission.findMany({ where: { studentId: user.id, assignment: { courseId: { in: ids } } }, select: { assignment: { select: { courseId: true } } } }),
    db.quizAttempt.findMany({
      where: { studentId: user.id, submittedAt: { not: null }, quiz: { published: true, courseId: { in: ids } } },
      distinct: ["quizId"],
      select: { quiz: { select: { courseId: true } } },
    }),
  ]);
  const doneBy = new Map<string, number>();
  for (const cid of [...lessons.map((l) => l.lesson.courseId), ...subs.map((s) => s.assignment.courseId), ...attempts.map((a) => a.quiz.courseId)])
    doneBy.set(cid, (doneBy.get(cid) ?? 0) + 1);
  return courses.map((c) => {
    const total = c._count.lessons + c._count.assignments + c._count.quizzes;
    return { ...c, progress: total ? Math.round(((doneBy.get(c.id) ?? 0) / total) * 100) : 0 };
  });
}

export async function getAssignments(user: CurrentUser, opts: { from?: Date; to?: Date; take?: number } = {}) {
  return db.assignment.findMany({
    where: {
      course: courseScope(user),
      dueAt: { gte: opts.from, lte: opts.to },
    },
    orderBy: { dueAt: "asc" },
    take: opts.take,
    include: {
      course: { select: { id: true, title: true, code: true, color: true, _count: { select: { enrollments: true } } } },
      submissions:
        user.role === "STUDENT"
          ? { where: { studentId: user.id }, select: { id: true, score: true, gradedAt: true, submittedAt: true } }
          : { select: { id: true, score: true, gradedAt: true, submittedAt: true } },
    },
  });
}

export async function getRecentAnnouncements(user: CurrentUser, take = 5) {
  return db.announcement.findMany({
    where: { course: courseScope(user) },
    orderBy: { createdAt: "desc" },
    take,
    include: { author: { select: { name: true } }, course: { select: { id: true, title: true, color: true } } },
  });
}

/** Options for a "Module" dropdown in lesson, assignment and quiz forms. */
export async function moduleOptions(courseId: string) {
  const modules = await db.module.findMany({ where: { courseId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true } });
  return [{ value: "", label: "No module (General)" }, ...modules.map((m, i) => ({ value: m.id, label: `Module ${i + 1}: ${m.title}` }))];
}

/** Published quizzes and exams with a close date in the window, with the user's attempts (students). */
export async function getQuizzes(user: CurrentUser, opts: { from?: Date; to?: Date; take?: number } = {}) {
  return db.quiz.findMany({
    where: {
      course: courseScope(user),
      ...(user.role === "STUDENT" ? { published: true } : {}),
      closesAt: { gte: opts.from, lte: opts.to },
    },
    orderBy: { closesAt: "asc" },
    take: opts.take,
    include: {
      course: { select: { id: true, title: true, code: true, color: true } },
      attempts: { where: user.role === "STUDENT" ? { studentId: user.id } : { needsReview: true }, select: { id: true, submittedAt: true, needsReview: true, score: true, maxScore: true } },
    },
  });
}
