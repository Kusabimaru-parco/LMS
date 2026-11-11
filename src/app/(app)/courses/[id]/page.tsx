import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronRight, Circle, ClipboardList, FileText, Megaphone, Plus, UserMinus, Users } from "lucide-react";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, ProgressBar, focusRing } from "@/components/ui";
import { AssignmentRow, AssignmentStatus } from "@/components/lms";
import { SimpleForm } from "@/components/simple-form";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { enrollStudents, postAnnouncement, unenrollStudent } from "@/app/actions";
import { cn, courseColor, timeAgo } from "@/lib/utils";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const c = await db.course.findUnique({ where: { id }, select: { title: true } });
  return { title: c?.title ?? "Course" };
}

const TABS = [
  { id: "lessons", label: "Lessons", icon: FileText },
  { id: "assignments", label: "Assignments", icon: ClipboardList },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "people", label: "People", icon: Users },
] as const;

export default async function CoursePage({ params, searchParams }: Params) {
  const { id } = await params;
  const tab = (await searchParams).tab ?? "lessons";
  const user = await requireUser();
  const access = await canAccessCourse(user, id);
  if (!access.canView) notFound();
  const { canManage } = access;

  const course = await db.course.findUniqueOrThrow({
    where: { id },
    include: {
      teacher: { select: { name: true, email: true } },
      lessons: { orderBy: { position: "asc" }, include: { progress: { where: { userId: user.id }, select: { userId: true } } } },
      _count: { select: { enrollments: true, assignments: true } },
    },
  });
  const c = courseColor(course.color);
  const done = course.lessons.filter((l) => l.progress.length).length;
  const pct = course.lessons.length ? (done / course.lessons.length) * 100 : 0;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
        <ol className="flex items-center gap-1">
          <li><Link href="/courses" className="hover:text-slate-900 hover:underline">Courses</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li aria-current="page" className="truncate font-medium text-slate-700">{course.title}</li>
        </ol>
      </nav>

      <Card className="mb-6 overflow-hidden">
        <div className={cn("relative px-5 py-6 text-white sm:px-6 sm:py-8", c.bg)}>
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(255,255,255,0.25),transparent_50%)]" />
          <div className="relative">
            <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold tracking-wide">{course.code}</span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/90 sm:text-base">{course.description}</p>
            <p className="mt-3 text-sm text-white/85">
              {course.teacher?.name ?? "No teacher assigned"} · {course._count.enrollments} students
            </p>
          </div>
        </div>
        {user.role === "STUDENT" && course.lessons.length > 0 && (
          <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
            <div className="flex-1"><ProgressBar value={pct} label="Course progress" /></div>
            <span className="shrink-0 text-sm text-slate-600">{done} of {course.lessons.length} lessons done</span>
          </div>
        )}
      </Card>

      <div className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav aria-label="Course sections" className="flex min-w-max gap-1 border-b border-slate-200">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <Link
                key={t.id}
                href={`/courses/${id}?tab=${t.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium",
                  focusRing,
                  active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                <t.icon className="size-4" aria-hidden />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {tab === "lessons" && (
        <Card>
          <CardHeader
            title="Lessons"
            description={`${course.lessons.length} lessons`}
            action={canManage && <ButtonLink href={`/courses/${id}/lessons/new`} variant="secondary"><Plus className="size-4" aria-hidden />Add lesson</ButtonLink>}
          />
          {course.lessons.length ? (
            <ol className="divide-y divide-slate-100">
              {course.lessons.map((l) => {
                const isDone = l.progress.length > 0;
                return (
                  <li key={l.id}>
                    <Link href={`/courses/${id}/lessons/${l.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                      {isDone ? (
                        <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label="Completed" />
                      ) : (
                        <Circle className="size-5 shrink-0 text-slate-300" aria-label="Not completed" />
                      )}
                      <span className="flex-1 text-sm font-medium text-slate-900">{l.title}</span>
                      <ChevronRight className="size-4 text-slate-400" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState icon={FileText} title="No lessons yet">{canManage ? "Add your first lesson to get students started." : "Your teacher hasn't posted lessons yet."}</EmptyState>
          )}
        </Card>
      )}

      {tab === "assignments" && <AssignmentsTab courseId={id} userId={user.id} role={user.role} canManage={canManage} />}
      {tab === "announcements" && <AnnouncementsTab courseId={id} canManage={canManage} />}
      {tab === "people" && <PeopleTab courseId={id} schoolId={user.schoolId} canManage={canManage} teacher={course.teacher} />}
    </>
  );
}

async function AssignmentsTab({ courseId, userId, role, canManage }: { courseId: string; userId: string; role: string; canManage: boolean }) {
  const [assignments, enrolled] = await Promise.all([
    db.assignment.findMany({
      where: { courseId },
      orderBy: { dueAt: "asc" },
      include: {
        course: { select: { title: true, color: true } },
        submissions: role === "STUDENT" ? { where: { studentId: userId } } : { select: { id: true, gradedAt: true, score: true, submittedAt: true } },
      },
    }),
    db.enrollment.count({ where: { courseId } }),
  ]);
  return (
    <Card>
      <CardHeader
        title="Assignments"
        action={canManage && <ButtonLink href={`/courses/${courseId}/assignments/new`} variant="secondary"><Plus className="size-4" aria-hidden />New assignment</ButtonLink>}
      />
      {assignments.length ? (
        <ul className="divide-y divide-slate-100">
          {assignments.map((a) => {
            const ungraded = a.submissions.filter((s) => !s.gradedAt).length;
            return (
              <AssignmentRow
                key={a.id}
                href={`/courses/${courseId}/assignments/${a.id}`}
                title={a.title}
                course={a.course}
                dueAt={a.dueAt}
                right={
                  role === "STUDENT" ? (
                    <AssignmentStatus dueAt={a.dueAt} points={a.points} submission={a.submissions[0]} />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="hidden text-xs text-slate-500 sm:inline">{a.submissions.length}/{enrolled} turned in</span>
                      {ungraded > 0 ? <Badge tone="warning">{ungraded} to grade</Badge> : <Badge tone="success">Up to date</Badge>}
                    </div>
                  )
                }
              />
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={ClipboardList} title="No assignments yet">{canManage ? "Create an assignment for students to submit work." : "Nothing assigned yet."}</EmptyState>
      )}
    </Card>
  );
}

async function AnnouncementsTab({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const items = await db.announcement.findMany({ where: { courseId }, orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } });
  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader title="Post an announcement" description="All students in this course will see it." />
          <div className="p-5">
            <SimpleForm
              action={postAnnouncement.bind(null, courseId)}
              resetOnSuccess
              submitLabel="Post announcement"
              pendingLabel="Posting…"
              fields={[
                { name: "title", label: "Title", required: true, placeholder: "e.g. Quiz moved to Friday" },
                { name: "body", label: "Message", type: "textarea", rows: 4, required: true },
              ]}
            />
          </div>
        </Card>
      )}
      {items.length ? (
        items.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={a.author.name} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{a.author.name}</p>
                <p className="text-xs text-slate-500">{timeAgo(a.createdAt)}</p>
              </div>
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">{a.title}</h3>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{a.body}</p>
          </Card>
        ))
      ) : (
        <Card><EmptyState icon={Megaphone} title="No announcements yet" /></Card>
      )}
    </div>
  );
}

async function PeopleTab({ courseId, schoolId, canManage, teacher }: { courseId: string; schoolId: string; canManage: boolean; teacher: { name: string; email: string } | null }) {
  const enrolled = await db.enrollment.findMany({
    where: { courseId },
    include: { user: { select: { id: true, name: true, email: true, gradeLevel: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const notEnrolled = canManage
    ? await db.user.findMany({
        where: { schoolId, role: "STUDENT", enrollments: { none: { courseId } } },
        select: { id: true, name: true, gradeLevel: true },
        orderBy: { name: "asc" },
      })
    : [];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Class list" description={`${enrolled.length} students`} />
        {teacher && (
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
            <Avatar name={teacher.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{teacher.name}</p>
              <p className="truncate text-xs text-slate-500">{teacher.email}</p>
            </div>
            <Badge tone="brand">Teacher</Badge>
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {enrolled.map(({ user: s }) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={s.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{s.name}</p>
                <p className="truncate text-xs text-slate-500">{canManage ? s.email : s.gradeLevel}</p>
              </div>
              {canManage && (
                <form action={unenrollStudent.bind(null, courseId, s.id)}>
                  <ConfirmButton
                    message={`Remove ${s.name} from this course?`}
                    aria-label={`Remove ${s.name} from course`}
                    title="Remove from course"
                    className={cn("flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600", focusRing)}
                  >
                    <UserMinus className="size-4" aria-hidden />
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {canManage && (
        <Card className="self-start">
          <CardHeader title="Add students" />
          {notEnrolled.length ? (
            <form action={enrollStudents.bind(null, courseId)} className="p-5">
              <fieldset>
                <legend className="sr-only">Students to add</legend>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {notEnrolled.map((s) => (
                    <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-slate-50">
                      <input type="checkbox" name="studentId" value={s.id} className="size-4 rounded border-slate-300 accent-brand-600" />
                      <span className="text-sm text-slate-800">{s.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton className="mt-4 w-full" pendingText="Adding…">Add selected</SubmitButton>
            </form>
          ) : (
            <p className="p-5 text-sm text-slate-500">Every student in the school is already in this course.</p>
          )}
        </Card>
      )}
    </div>
  );
}
