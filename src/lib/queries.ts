import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";

/** Courses visible to a user, scoped to their school and role. */
export function courseScope(user: CurrentUser): Prisma.CourseWhereInput {
  if (user.role === "ADMIN") return { schoolId: user.schoolId };
  if (user.role === "TEACHER") return { schoolId: user.schoolId, teacherId: user.id };
  return { schoolId: user.schoolId, enrollments: { some: { userId: user.id } } };
}

export async function getCourses(user: CurrentUser) {
  const courses = await db.course.findMany({
    where: courseScope(user),
    orderBy: { title: "asc" },
    include: {
      teacher: { select: { name: true } },
      _count: { select: { enrollments: true, lessons: true, assignments: true } },
      lessons: { select: { id: true } },
    },
  });
  // Lesson progress for the current user
  const done = await db.lessonProgress.findMany({
    where: { userId: user.id, lesson: { courseId: { in: courses.map((c) => c.id) } } },
    select: { lesson: { select: { courseId: true } } },
  });
  const doneBy = new Map<string, number>();
  for (const d of done) doneBy.set(d.lesson.courseId, (doneBy.get(d.lesson.courseId) ?? 0) + 1);
  return courses.map(({ lessons, ...c }) => ({
    ...c,
    progress: lessons.length ? Math.round(((doneBy.get(c.id) ?? 0) / lessons.length) * 100) : 0,
  }));
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
