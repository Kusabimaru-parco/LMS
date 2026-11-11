import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, verifySession, type Role } from "./session";

/** Current signed-in user (with school), or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, gradeLevel: true, schoolId: true, school: true },
  });
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role as Role)) redirect("/dashboard");
  return user;
}

/** Can this user see the course? Admins: any course in school; teachers: own; students: enrolled. */
export async function canAccessCourse(user: CurrentUser, courseId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, schoolId: user.schoolId },
    select: { id: true, teacherId: true, enrollments: { where: { userId: user.id }, select: { id: true } } },
  });
  if (!course) return { course: null, canView: false, canManage: false };
  const canManage = user.role === "ADMIN" || course.teacherId === user.id;
  const canView = canManage || course.enrollments.length > 0;
  return { course, canView, canManage };
}
