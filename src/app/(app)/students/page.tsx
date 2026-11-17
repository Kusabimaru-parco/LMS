import type { Metadata } from "next";
import Link from "next/link";
import { Contact, Mail, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseScope } from "@/lib/queries";
import { Avatar, Card, EmptyState, Input, PageHeader, focusRing } from "@/components/ui";
import { CourseDot } from "@/components/lms";
import { cn, timeAgo, avatarUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Students" };

/** Teachers: students in their classes. Admins: every student in the school. With emails. */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; course?: string }> }) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const { q = "", course = "" } = await searchParams;
  const courses = await db.course.findMany({ where: courseScope(user), orderBy: { title: "asc" }, select: { id: true, title: true, color: true } });
  const courseIds = course && courses.some((c) => c.id === course) ? [course] : courses.map((c) => c.id);

  const students = await db.user.findMany({
    where: {
      schoolId: user.schoolId,
      role: "STUDENT",
      ...(user.role === "TEACHER" || course ? { enrollments: { some: { courseId: { in: courseIds } } } } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      gradeLevel: true,
      lastLoginAt: true,
      avatarUpdatedAt: true,
      enrollments: { where: { courseId: { in: courses.map((c) => c.id) } }, select: { course: { select: { id: true, title: true, color: true } } } },
    },
  });
  const allEmails = students.map((s) => s.email).join(",");

  return (
    <>
      <PageHeader
        title="Students"
        description={user.role === "TEACHER" ? "Everyone in your classes, with their school email." : "Every student at your school, with their school email."}
        actions={students.length > 0 && (
          <a href={`mailto:?bcc=${allEmails}`} className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 sm:min-h-10", focusRing)}>
            <Mail className="size-4" aria-hidden />Email {students.length === 1 ? "student" : `all ${students.length}`}
          </a>
        )}
      />
      <Card>
        <div className="space-y-3 border-b border-slate-100 p-4">
          <form role="search" className="relative">
            <input type="hidden" name="course" value={course} />
            <label htmlFor="q" className="sr-only">Search students</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search by name or email" className="pl-9" />
          </form>
          {courses.length > 1 && (
            <nav aria-label="Filter by course" className="no-scrollbar -mx-4 overflow-x-auto px-4">
              <ul className="flex min-w-max gap-2">
                {[{ id: "", title: "All classes", color: "" }, ...courses].map((c) => (
                  <li key={c.id}>
                    <Link href={`/students?course=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={course === c.id ? "page" : undefined}
                      className={cn("inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-medium", focusRing,
                        course === c.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
                      {c.color && course !== c.id && <CourseDot color={c.color} />}{c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <p className="px-5 pt-3 text-xs text-slate-500" aria-live="polite">{students.length} student{students.length === 1 ? "" : "s"}</p>
        {students.length === 0 ? (
          <EmptyState icon={Contact} title={q ? "No matches" : "No students yet"}>
            {q ? "Try a different name or email." : "Students appear here when they join your classes with the class code, or when you add them."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {students.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{s.name}{s.gradeLevel && <span className="font-normal text-slate-500"> · {s.gradeLevel}</span>}</p>
                  <a href={`mailto:${s.email}`} className="block truncate text-sm text-brand-700 hover:underline">{s.email}</a>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {s.enrollments.map((e) => (
                      <span key={e.course.id} className="inline-flex items-center gap-1"><CourseDot color={e.course.color} />{e.course.title}</span>
                    ))}
                  </p>
                </div>
                <span className="hidden shrink-0 text-xs text-slate-500 sm:block">{s.lastLoginAt ? `Active ${timeAgo(s.lastLoginAt)}` : "Never signed in"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
