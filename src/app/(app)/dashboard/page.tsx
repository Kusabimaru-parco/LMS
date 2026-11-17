import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  GraduationCap,
  Inbox,
  Mail,
  Megaphone,
  Plus,
  Timer,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAssignments, getCourses, getQuizzes, getRecentAnnouncements } from "@/lib/queries";
import { QuizBadge } from "@/components/course-outline";
import { SimpleForm } from "@/components/simple-form";
import { joinCourse } from "@/app/actions";
import { Alert, Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { AssignmentRow, AssignmentStatus, CourseCard, CourseDot } from "@/components/lms";
import { ParentDashboard } from "./parent-dashboard";
import { Hero, heroButton } from "@/components/hero";
import { availableUpdate } from "@/lib/updates";
import { APP_VERSION } from "@/lib/version";
import { formatDate, percent, ROLE_LABEL, timeAgo, avatarUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ passwordChanged?: string; child?: string }> }) {
  const user = await requireUser();
  const { passwordChanged, child } = await searchParams;
  const first = user.name.split(" ")[0];
  return (
    <>
      <Hero
        seed={user.schoolId}
        eyebrow={formatDate(new Date())}
        title={<>{greeting()}, {first}</>}
        description={
          user.role === "STUDENT"
            ? "Here's what's happening in your classes."
            : user.role === "PARENT"
              ? "How your children are doing at school."
              : user.role === "TEACHER"
                ? "Here's an overview of your classes and work to grade."
                : `Here's how ${user.school.name} is doing today.`
        }
        actions={
          (user.role === "ADMIN" || user.role === "TEACHER") ? (
            <Link href="/courses/new" className={heroButton}>
              <Plus className="size-4" aria-hidden /> New course
            </Link>
          ) : user.role === "STUDENT" ? (
            <Link href="/calendar" className={heroButton}>
              <CalendarClock className="size-4" aria-hidden /> My calendar
            </Link>
          ) : null
        }
      />
      {passwordChanged && <div className="mb-6"><Alert>Your new password is saved. Welcome!</Alert></div>}
      {user.role === "STUDENT" && <StudentDashboard user={user} />}
      {user.role === "TEACHER" && <TeacherDashboard user={user} />}
      {user.role === "ADMIN" && <AdminDashboard user={user} />}
      {user.role === "PARENT" && <ParentDashboard user={user} childId={child} />}
    </>
  );
}

const weekFromNow = () => new Date(Date.now() + 7 * 86_400_000);

async function StudentDashboard({ user }: { user: CurrentUser }) {
  const [courses, upcoming, quizzes, announcements, graded, lessonsDone] = await Promise.all([
    getCourses(user),
    getAssignments(user, { from: new Date(Date.now() - 3 * 86_400_000), take: 6 }),
    getQuizzes(user, { from: new Date(), take: 6 }),
    getRecentAnnouncements(user, 4),
    db.submission.findMany({
      where: { studentId: user.id, gradedAt: { not: null } },
      select: { score: true, assignment: { select: { points: true } } },
    }),
    db.lessonProgress.count({ where: { userId: user.id } }),
  ]);
  const openQuizzes = quizzes.filter((q) => !q.attempts.some((a) => a.submittedAt));
  const dueThisWeek =
    upcoming.filter((a) => a.dueAt <= weekFromNow() && a.dueAt >= new Date() && !a.submissions[0]).length +
    openQuizzes.filter((q) => q.closesAt! <= weekFromNow()).length;
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
          {upcoming.length || quizzes.length ? (
            <ul className="divide-y divide-slate-100">
              {[
                ...upcoming.map((a) => ({
                  at: a.dueAt,
                  el: (
                    <AssignmentRow key={a.id} href={`/courses/${a.course.id}/assignments/${a.id}`} title={a.title} course={a.course} dueAt={a.dueAt}
                      right={<AssignmentStatus dueAt={a.dueAt} points={a.points} submission={a.submissions[0]} />} />
                  ),
                })),
                ...quizzes.map((q) => ({
                  at: q.closesAt!,
                  el: (
                    <AssignmentRow key={q.id} href={`/courses/${q.course.id}/quizzes/${q.id}`} title={`${q.kind === "EXAM" ? "Exam" : "Quiz"}: ${q.title}`} course={q.course} dueAt={q.closesAt!}
                      right={<QuizBadge q={{ ...q, _count: { questions: 0 }, attempts: q.attempts.map((a) => ({ ...a, studentId: user.id })) }} isStudent />} />
                  ),
                })),
              ]
                .sort((x, y) => x.at.getTime() - y.at.getTime())
                .slice(0, 8)
                .map((x) => x.el)}
            </ul>
          ) : (
            <EmptyState icon={CheckCheck} title="Nothing due">You have no upcoming assignments. Enjoy the break!</EmptyState>
          )}
        </Card>
        <Announcements items={announcements} />
      </div>

      <section aria-labelledby="my-courses">
        <h2 id="my-courses" className="mb-3 text-lg font-semibold text-slate-900">My courses</h2>
        {courses.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => <CourseCard key={c.id} course={c} showProgress />)}
          </div>
        ) : (
          <Card>
            <CardHeader title="Join your first class" description="Type the class code your teacher gave you." />
            <div className="p-5">
              <SimpleForm action={joinCourse} submitLabel="Join class" pendingLabel="Joining…"
                fields={[{ name: "code", label: "Class code", required: true, placeholder: "e.g. K7QM2X", autoComplete: "off" }]} />
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

async function TeacherDashboard({ user }: { user: CurrentUser }) {
  const [courses, announcements, toGrade, dueSoon, toReview, students] = await Promise.all([
    getCourses(user),
    getRecentAnnouncements(user, 4),
    db.submission.findMany({
      where: { gradedAt: null, assignment: { course: { teacherId: user.id } } },
      orderBy: { submittedAt: "asc" },
      include: { student: { select: { id: true, name: true, avatarUpdatedAt: true } }, assignment: { include: { course: true } } },
    }),
    getAssignments(user, { from: new Date(), to: weekFromNow() }),
    db.quizAttempt.findMany({
      where: { needsReview: true, submittedAt: { not: null }, quiz: { course: { teacherId: user.id, schoolId: user.schoolId } } },
      orderBy: { submittedAt: "asc" },
      include: { student: { select: { id: true, name: true, avatarUpdatedAt: true } }, quiz: { select: { id: true, title: true, courseId: true, course: { select: { code: true, color: true } } } } },
    }),
    db.user.findMany({
      where: { schoolId: user.schoolId, role: "STUDENT", enrollments: { some: { course: { teacherId: user.id } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, gradeLevel: true, avatarUpdatedAt: true },
    }),
  ]);
  const studentCount = students.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="My courses" value={courses.length} icon={BookOpen} />
        <Stat label="Students" value={studentCount} icon={Users} />
        <Stat label="Waiting to grade" value={toGrade.length + toReview.length} icon={Inbox} hint={toGrade.length + toReview.length ? "Oldest first below" : "All caught up"} />
        <Stat label="Due this week" value={dueSoon.length} icon={CalendarClock} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Needs grading" description="Submissions and quiz answers waiting for you" />
          {toGrade.length || toReview.length ? (
            <ul className="divide-y divide-slate-100">
              {toReview.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link href={`/courses/${a.quiz.courseId}/quizzes/${a.quiz.id}/attempts/${a.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                    <Avatar name={a.student.name} size="sm" src={avatarUrl(a.student)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{a.student.name}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                        <CourseDot color={a.quiz.course.color} />
                        <span className="truncate">{a.quiz.title} · {a.quiz.course.code}</span>
                      </p>
                    </div>
                    <Badge tone="warning" icon={Timer}>Essay</Badge>
                  </Link>
                </li>
              ))}
              {toGrade.slice(0, 7).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/courses/${s.assignment.courseId}/assignments/${s.assignmentId}?student=${s.studentId}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                  >
                    <Avatar name={s.student.name} size="sm" src={avatarUrl(s.student)} />
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

      <Card>
        <CardHeader title="Your students" description={`${studentCount} in your classes`}
          action={<Link href="/students" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
        {students.length ? (
          <ul className="grid sm:grid-cols-2">
            {students.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
                <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{s.name}{s.gradeLevel && <span className="font-normal text-slate-500"> · {s.gradeLevel}</span>}</p>
                  <a href={`mailto:${s.email}`} className="flex items-center gap-1 truncate text-xs text-brand-700 hover:underline">
                    <Mail className="size-3 shrink-0" aria-hidden /><span className="truncate">{s.email}</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title="No students yet">Share your class code (shown on each course page) so students can join.</EmptyState>
        )}
      </Card>

      <Card>
        <CardHeader title="Your students" description={`${studentCount} in your classes`}
          action={<Link href="/students" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
        {students.length ? (
          <ul className="grid sm:grid-cols-2">
            {students.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
                <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{s.name}{s.gradeLevel && <span className="font-normal text-slate-500"> · {s.gradeLevel}</span>}</p>
                  <a href={`mailto:${s.email}`} className="flex items-center gap-1 truncate text-xs text-brand-700 hover:underline">
                    <Mail className="size-3 shrink-0" aria-hidden /><span className="truncate">{s.email}</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title="No students yet">Share your class code (shown on each course page) so students can join.</EmptyState>
        )}
      </Card>

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
  const update = await availableUpdate();

  return (
    <div className="space-y-6">
      {update && (
        <Alert tone={update.security ? "danger" : "info"}>
          <strong>Campus LMS {update.version} is available</strong> (this server runs {APP_VERSION}).
          {update.security && " It includes security fixes, so please update soon."} {update.notes}{" "}
          {update.url && <a href={update.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">What's new</a>}
          {" · "}See docs/UPDATING.md for the one-command update.
        </Alert>
      )}
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
          <CardHeader title="Recently added people" action={<Link href="/students" className="text-sm font-medium text-brand-700 hover:underline">All students</Link>} />
          <ul className="divide-y divide-slate-100">
            {recentUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={u.name} size="sm" src={avatarUrl(u)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{u.name}</p>
                  <a href={`mailto:${u.email}`} className="block truncate text-xs text-brand-700 hover:underline">{u.email}</a>
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
