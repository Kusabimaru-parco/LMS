import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  GraduationCap,
  Inbox,
  Megaphone,
  Plus,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAssignments, getCourses, getRecentAnnouncements } from "@/lib/queries";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { AssignmentRow, AssignmentStatus, CourseCard, CourseDot } from "@/components/lms";
import { formatDate, percent, ROLE_LABEL, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const first = user.name.split(" ")[0];
  return (
    <>
      <PageHeader
        eyebrow={formatDate(new Date())}
        title={`${greeting()}, ${first}`}
        description={
          user.role === "STUDENT"
            ? "Here's what's happening in your classes."
            : user.role === "TEACHER"
              ? "Here's an overview of your classes and work to grade."
              : `Here's how ${user.school.name} is doing today.`
        }
        actions={
          user.role !== "STUDENT" && (
            <ButtonLink href="/courses/new">
              <Plus className="size-4" aria-hidden /> New course
            </ButtonLink>
          )
        }
      />
      {user.role === "STUDENT" && <StudentDashboard user={user} />}
      {user.role === "TEACHER" && <TeacherDashboard user={user} />}
      {user.role === "ADMIN" && <AdminDashboard user={user} />}
    </>
  );
}

const weekFromNow = () => new Date(Date.now() + 7 * 86_400_000);

async function StudentDashboard({ user }: { user: CurrentUser }) {
  const [courses, upcoming, announcements, graded, lessonsDone] = await Promise.all([
    getCourses(user),
    getAssignments(user, { from: new Date(Date.now() - 3 * 86_400_000), take: 6 }),
    getRecentAnnouncements(user, 4),
    db.submission.findMany({
      where: { studentId: user.id, gradedAt: { not: null } },
      select: { score: true, assignment: { select: { points: true } } },
    }),
    db.lessonProgress.count({ where: { userId: user.id } }),
  ]);
  const dueThisWeek = upcoming.filter((a) => a.dueAt <= weekFromNow() && a.dueAt >= new Date() && !a.submissions[0]).length;
  const avg = graded.length
    ? Math.round(graded.reduce((s, g) => s + (percent(g.score, g.assignment.points) ?? 0), 0) / graded.length)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="My courses" value={courses.length} icon={BookOpen} />
        <Stat label="Due this week" value={dueThisWeek} icon={CalendarClock} hint={dueThisWeek ? "Keep going — you've got this." : "You're all caught up."} />
        <Stat label="Average grade" value={avg == null ? "—" : `${avg}%`} icon={TrendingUp} />
        <Stat label="Lessons completed" value={lessonsDone} icon={CheckCheck} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Upcoming work" action={<Link href="/assignments" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
          {upcoming.length ? (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((a) => (
                <AssignmentRow
                  key={a.id}
                  href={`/courses/${a.course.id}/assignments/${a.id}`}
                  title={a.title}
                  course={a.course}
                  dueAt={a.dueAt}
                  right={<AssignmentStatus dueAt={a.dueAt} points={a.points} submission={a.submissions[0]} />}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={CheckCheck} title="Nothing due">You have no upcoming assignments. Enjoy the break!</EmptyState>
          )}
        </Card>
        <Announcements items={announcements} />
      </div>

      <section aria-labelledby="my-courses">
        <h2 id="my-courses" className="mb-3 text-lg font-semibold text-slate-900">My courses</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => <CourseCard key={c.id} course={c} showProgress />)}
        </div>
      </section>
    </div>
  );
}

async function TeacherDashboard({ user }: { user: CurrentUser }) {
  const [courses, announcements, toGrade, dueSoon] = await Promise.all([
    getCourses(user),
    getRecentAnnouncements(user, 4),
    db.submission.findMany({
      where: { gradedAt: null, assignment: { course: { teacherId: user.id } } },
      orderBy: { submittedAt: "asc" },
      include: { student: { select: { name: true } }, assignment: { include: { course: true } } },
    }),
    getAssignments(user, { from: new Date(), to: weekFromNow() }),
  ]);
  const studentCount = new Set(
    (await db.enrollment.findMany({ where: { course: { teacherId: user.id } }, select: { userId: true } })).map((e) => e.userId),
  ).size;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="My courses" value={courses.length} icon={BookOpen} />
        <Stat label="Students" value={studentCount} icon={Users} />
        <Stat label="Waiting to grade" value={toGrade.length} icon={Inbox} hint={toGrade.length ? "Oldest first below" : "All caught up"} />
        <Stat label="Due this week" value={dueSoon.length} icon={CalendarClock} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Needs grading" description="Submissions waiting for your feedback" />
          {toGrade.length ? (
            <ul className="divide-y divide-slate-100">
              {toGrade.slice(0, 7).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/courses/${s.assignment.courseId}/assignments/${s.assignmentId}?student=${s.studentId}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                  >
                    <Avatar name={s.student.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{s.student.name}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                        <CourseDot color={s.assignment.course.color} />
                        <span className="truncate">{s.assignment.title} · {s.assignment.course.code}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{timeAgo(s.submittedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CheckCheck} title="All caught up">There are no submissions waiting for a grade.</EmptyState>
          )}
        </Card>
        <Announcements items={announcements} />
      </div>

      <section aria-labelledby="my-courses">
        <h2 id="my-courses" className="mb-3 text-lg font-semibold text-slate-900">My courses</h2>
        {courses.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => <CourseCard key={c.id} course={c} showProgress={false} />)}
          </div>
        ) : (
          <Card><EmptyState icon={BookOpen} title="No courses yet" action={<ButtonLink href="/courses/new">Create course</ButtonLink>}>Create your first course to start adding lessons and assignments.</EmptyState></Card>
        )}
      </section>
    </div>
  );
}

async function AdminDashboard({ user }: { user: CurrentUser }) {
  const s = user.schoolId;
  const [students, teachers, courses, assignmentsPast, submissions, recentUsers, courseList] = await Promise.all([
    db.user.count({ where: { schoolId: s, role: "STUDENT" } }),
    db.user.count({ where: { schoolId: s, role: "TEACHER" } }),
    db.course.count({ where: { schoolId: s } }),
    db.assignment.findMany({ where: { course: { schoolId: s }, dueAt: { lt: new Date() } }, select: { course: { select: { _count: { select: { enrollments: true } } } } } }),
    db.submission.count({ where: { assignment: { course: { schoolId: s }, dueAt: { lt: new Date() } } } }),
    db.user.findMany({ where: { schoolId: s }, orderBy: { createdAt: "desc" }, take: 5 }),
    getCourses(user),
  ]);
  const expected = assignmentsPast.reduce((n, a) => n + a.course._count.enrollments, 0);
  const rate = expected ? Math.round((submissions / expected) * 100) : null;
  const steps = [
    { done: true, label: "Set up your school", href: "/admin/settings", cta: "Review settings" },
    { done: teachers > 0, label: "Add your teachers", href: "/admin/users?role=TEACHER", cta: "Add teachers" },
    { done: students > 0, label: "Add your students", href: "/admin/users?role=STUDENT", cta: "Add students" },
    { done: courses > 0, label: "Create your first course", href: "/courses/new", cta: "Create course" },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <div className="space-y-6">
      {remaining > 0 && (
        <Card>
          <CardHeader title="Get your school started" description={`${steps.length - remaining} of ${steps.length} done. Finish these so teachers and students can begin.`} />
          <ol className="divide-y divide-slate-100">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 px-5 py-3.5">
                {s.done ? (
                  <CheckCheck className="size-5 shrink-0 text-emerald-600" aria-label="Done" />
                ) : (
                  <span className="size-5 shrink-0 rounded-full border-2 border-slate-300" aria-label="Not done" />
                )}
                <span className={s.done ? "flex-1 text-sm text-slate-500 line-through" : "flex-1 text-sm font-medium text-slate-900"}>{s.label}</span>
                {!s.done && <ButtonLink href={s.href} variant="secondary">{s.cta}</ButtonLink>}
              </li>
            ))}
          </ol>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Students" value={students} icon={GraduationCap} />
        <Stat label="Teachers" value={teachers} icon={UserCog} />
        <Stat label="Courses" value={courses} icon={BookOpen} />
        <Stat label="Submission rate" value={rate == null ? "—" : `${rate}%`} icon={ClipboardList} hint="Work handed in for past-due assignments" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Courses" action={<Link href="/courses" className="text-sm font-medium text-brand-700 hover:underline">Manage</Link>} />
          {courseList.length === 0 && (
            <EmptyState icon={BookOpen} title="No courses yet" action={<ButtonLink href="/courses/new">Create course</ButtonLink>}>
              Courses you or your teachers create will be listed here.
            </EmptyState>
          )}
          <ul className="divide-y divide-slate-100">
            {courseList.map((c) => (
              <li key={c.id}>
                <Link href={`/courses/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                  <CourseDot color={c.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{c.title}</p>
                    <p className="truncate text-xs text-slate-500">{c.code} · {c.teacher?.name ?? "No teacher"}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{c._count.enrollments} students</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recently added people" action={<Link href="/admin/users" className="text-sm font-medium text-brand-700 hover:underline">All</Link>} />
          <ul className="divide-y divide-slate-100">
            {recentUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={u.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{u.name}</p>
                  <p className="truncate text-xs text-slate-500">{u.email}</p>
                </div>
                <Badge tone={u.role === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Announcements({ items }: { items: Awaited<ReturnType<typeof getRecentAnnouncements>> }) {
  return (
    <Card>
      <CardHeader title="Announcements" />
      {items.length ? (
        <ul className="divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <Link href={`/courses/${a.course.id}?tab=announcements`} className="group block focus-visible:outline-none">
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <CourseDot color={a.course.color} />
                  <span className="truncate">{a.course.title}</span>
                  <span aria-hidden>·</span>
                  <span className="whitespace-nowrap">{timeAgo(a.createdAt)}</span>
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 group-hover:text-brand-700 group-focus-visible:underline">{a.title}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{a.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Megaphone} title="No announcements">Updates from your teachers will appear here.</EmptyState>
      )}
    </Card>
  );
}
