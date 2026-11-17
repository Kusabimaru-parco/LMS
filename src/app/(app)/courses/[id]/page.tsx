import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  KeyRound,
  Layers,
  Mail,
  Megaphone,
  Plus,
  RefreshCw,
  Timer,
  UserMinus,
  Users,
  CalendarCheck2,
  Settings2,
} from "lucide-react";
import { AttendanceTab, SettingsTab } from "./extra-tabs";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignJoinCode } from "@/lib/codes";
import { Alert, Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, ProgressBar, focusRing } from "@/components/ui";
import { AssignmentRow, AssignmentStatus } from "@/components/lms";
import { ActivityList, activityCount, activityInclude, doneCount } from "@/components/course-outline";
import { formatIcon } from "@/components/materials";
import { SimpleForm } from "@/components/simple-form";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { CopyValue } from "@/components/copy-value";
import { enrollStudents, newJoinCode, postAnnouncement, setJoinEnabled, unenrollStudent } from "@/app/actions";
import { cn, courseColor, timeAgo, avatarUrl } from "@/lib/utils";
import { coverStyle } from "@/lib/patterns";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; joined?: string; date?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const c = await db.course.findUnique({ where: { id }, select: { title: true } });
  return { title: c?.title ?? "Course" };
}

const TABS = [
  { id: "outline", label: "Course outline", icon: Layers },
  { id: "assignments", label: "Assignments", icon: ClipboardList },
  { id: "quizzes", label: "Quizzes & exams", icon: Timer },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "people", label: "People", icon: Users },
  { id: "attendance", label: "Attendance", icon: CalendarCheck2 },
  { id: "settings", label: "Settings", icon: Settings2, manage: true },
] as const;

/** Module descriptions use a little Markdown; strip it for one-line previews. */
const plain = (md: string) => md.replace(/^#+\s*/gm, "").replace(/^-\s+/gm, "• ").replace(/\s*\n\s*/g, " ").trim();

export default async function CoursePage({ params, searchParams }: Params) {
  const { id } = await params;
  const { tab = "outline", joined, date } = await searchParams;
  const user = await requireUser(["ADMIN", "TEACHER", "STUDENT"]);
  const access = await canAccessCourse(user, id);
  if (!access.canView) notFound();
  const { canManage } = access;
  const isStudent = user.role === "STUDENT";

  const course = await db.course.findUniqueOrThrow({
    where: { id },
    include: { teacher: { select: { id: true, name: true, email: true, avatarUpdatedAt: true } }, school: { select: { gradeWeights: true } }, _count: { select: { enrollments: true } } },
  });
  const joinCode = canManage ? course.joinCode ?? (await assignJoinCode(id)) : null;
  const c = courseColor(course.color);

  const inc = activityInclude(user.id, isStudent);
  const [modules, loose] = await Promise.all([
    db.module.findMany({
      where: { courseId: id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        ...inc,
        materials: { orderBy: { position: "asc" }, select: { id: true, title: true, format: true } },
        completions: { where: { userId: user.id }, select: { userId: true } },
      },
    }),
    db.course.findUniqueOrThrow({
      where: { id },
      select: {
        lessons: { ...inc.lessons, where: { moduleId: null } },
        assignments: { ...inc.assignments, where: { moduleId: null } },
        quizzes: { ...inc.quizzes, where: { ...inc.quizzes.where, moduleId: null } },
      },
    }),
  ]);
  const total = modules.reduce((n, m) => n + activityCount(m), 0) + activityCount(loose);
  const done = modules.reduce((n, m) => n + doneCount(m), 0) + doneCount(loose);
  const pct = total ? (done / total) * 100 : 0;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
        <ol className="flex items-center gap-1">
          <li><Link href="/courses" className="hover:text-slate-900 hover:underline">Courses</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li aria-current="page" className="truncate font-medium text-slate-700">{course.title}</li>
        </ol>
      </nav>

      {joined && <div className="mb-4"><Alert>You joined {course.title}. Welcome to the class!</Alert></div>}

      <Card className="mb-6 overflow-hidden">
        <div className={cn("relative px-5 py-7 text-white sm:px-7 sm:py-9", c.bg)} style={coverStyle(course.id)}>
          <div className="relative">
            <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-slate-800">{course.code}</span>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">{course.title}</h1>
            {course.description && <p className="mt-1 max-w-2xl text-sm text-white/90 sm:text-base">{course.description}</p>}
            <p className="mt-3 text-sm text-white/85">
              {course.teacher?.name ?? "No teacher assigned"} · {course._count.enrollments} students
            </p>
          </div>
        </div>
        {isStudent && total > 0 && (
          <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
            <div className="flex-1"><ProgressBar value={pct} label="Course progress" /></div>
            <span className="shrink-0 text-sm text-slate-600">{done} of {total} done</span>
          </div>
        )}
        {canManage && joinCode && (
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">Class code</p>
              <p className="text-xs text-slate-500">
                {course.joinEnabled ? "Students join by typing this code on their Courses page." : "Joining with the code is turned off."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {course.joinEnabled && <CopyValue value={joinCode} large />}
              {course.joinEnabled && (
                <form action={newJoinCode.bind(null, id)}>
                  <ConfirmButton message="Make a new class code? The old code will stop working." title="Make a new code" aria-label="Make a new class code"
                    className={cn("flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100", focusRing)}>
                    <RefreshCw className="size-4" aria-hidden />
                  </ConfirmButton>
                </form>
              )}
              <form action={setJoinEnabled.bind(null, id, !course.joinEnabled)}>
                <SubmitButton variant="ghost" pendingText="Saving…">{course.joinEnabled ? "Turn off" : "Turn on joining"}</SubmitButton>
              </form>
            </div>
          </div>
        )}
      </Card>

      <div className="mb-6 no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav aria-label="Course sections" className="flex min-w-max gap-1 border-b border-slate-200">
          {TABS.filter((t) => !("manage" in t) || canManage).map((t) => {
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

      {tab === "outline" && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/courses/${id}/modules/new`}><Plus className="size-4" aria-hidden />Add module</ButtonLink>
              <ButtonLink href={`/courses/${id}/lessons/new`} variant="secondary">Add lesson</ButtonLink>
              <ButtonLink href={`/courses/${id}/quizzes/new`} variant="secondary">Add quiz</ButtonLink>
              <ButtonLink href={`/courses/${id}/quizzes/new?kind=EXAM`} variant="secondary">Add exam</ButtonLink>
            </div>
          )}

          {activityCount(loose) > 0 && (
            <Card>
              <CardHeader title="General" description="Course items that aren't in a module" />
              <ActivityList data={loose} courseId={id} isStudent={isStudent} />
            </Card>
          )}

          {modules.map((m, i) => {
            const count = activityCount(m);
            const mDone = doneCount(m);
            const complete = isStudent && (m.completions.length > 0 || (count > 0 && mDone === count));
            return (
              <Card key={m.id} className="overflow-hidden">
                <div className="flex items-start gap-4 px-5 py-4">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold", complete ? "bg-emerald-600 text-white" : "bg-brand-50 text-brand-700")}>
                    {complete ? <CheckCircle2 className="size-5" aria-label="Completed" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-500">Module {i + 1}</p>
                    <h2 className="text-base font-semibold text-slate-900">
                      <Link href={`/courses/${id}/modules/${m.id}`} className="hover:text-brand-700 hover:underline">{m.title}</Link>
                    </h2>
                    {m.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{plain(m.description)}</p>}
                  </div>
                  {isStudent && count > 0 && (
                    <span className="hidden shrink-0 sm:block">{complete ? <Badge tone="success">Completed</Badge> : <Badge>{mDone}/{count} done</Badge>}</span>
                  )}
                </div>
                {m.materials.length > 0 && (
                  <ul className="flex flex-wrap gap-2 px-5 pb-4">
                    {m.materials.map((mat) => {
                      const Icon = formatIcon(mat.format);
                      return (
                        <li key={mat.id}>
                          <Link href={`/courses/${id}/modules/${m.id}#material-${mat.id}`}
                            className={cn("inline-flex min-h-9 max-w-72 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700", focusRing)}>
                            <Icon className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{mat.title}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {count > 0 ? (
                  <div className="border-t border-slate-100"><ActivityList data={m} courseId={id} isStudent={isStudent} /></div>
                ) : (
                  !m.materials.length && <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">Nothing in this module yet.</p>
                )}
              </Card>
            );
          })}

          {modules.length === 0 && activityCount(loose) === 0 && (
            <Card>
              <EmptyState icon={Layers} title="No modules yet"
                action={canManage && <ButtonLink href={`/courses/${id}/modules/new`}><Plus className="size-4" aria-hidden />Add the first module</ButtonLink>}>
                {canManage
                  ? "Modules organise the course by week or topic. Each one holds a description of the activities, slides or PDFs, lessons, assignments and quizzes."
                  : "Your teacher hasn't added anything yet. Check back soon."}
              </EmptyState>
            </Card>
          )}
        </div>
      )}

      {tab === "assignments" && <AssignmentsTab courseId={id} userId={user.id} role={user.role} canManage={canManage} />}
      {tab === "quizzes" && <QuizzesTab courseId={id} userId={user.id} isStudent={isStudent} canManage={canManage} />}
      {tab === "announcements" && <AnnouncementsTab courseId={id} canManage={canManage} />}
      {tab === "attendance" && <AttendanceTab courseId={id} canManage={canManage} userId={user.id} date={date} />}
      {tab === "settings" && canManage && <SettingsTab course={course} schoolWeights={course.school.gradeWeights} />}
      {tab === "people" && <PeopleTab courseId={id} schoolId={user.schoolId} canManage={canManage} teacher={course.teacher} joinCode={course.joinEnabled ? joinCode : null} />}
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
        <EmptyState icon={ClipboardList} title="No assignments yet">{canManage ? "Create an assignment for students to hand in work." : "Nothing assigned yet."}</EmptyState>
      )}
    </Card>
  );
}

async function QuizzesTab({ courseId, userId, isStudent, canManage }: { courseId: string; userId: string; isStudent: boolean; canManage: boolean }) {
  const inc = activityInclude(userId, isStudent);
  const data = await db.course.findUniqueOrThrow({ where: { id: courseId }, select: { quizzes: inc.quizzes } });
  const exams = data.quizzes.filter((q) => q.kind === "EXAM");
  const quizzes = data.quizzes.filter((q) => q.kind !== "EXAM");
  const empty = { lessons: [], assignments: [] };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Quizzes" description="Practice and graded quizzes, marked automatically."
          action={canManage && <ButtonLink href={`/courses/${courseId}/quizzes/new`} variant="secondary"><Plus className="size-4" aria-hidden />New quiz</ButtonLink>} />
        {quizzes.length ? <ActivityList data={{ ...empty, quizzes }} courseId={courseId} isStudent={isStudent} />
          : <EmptyState icon={Timer} title="No quizzes yet">{canManage ? "Build a quiz with multiple choice, true/false, short answer and essay questions." : "No quizzes have been posted yet."}</EmptyState>}
      </Card>
      <Card>
        <CardHeader title="Exams" description="Timed, with one attempt by default."
          action={canManage && <ButtonLink href={`/courses/${courseId}/quizzes/new?kind=EXAM`} variant="secondary"><Plus className="size-4" aria-hidden />New exam</ButtonLink>} />
        {exams.length ? <ActivityList data={{ ...empty, quizzes: exams }} courseId={courseId} isStudent={isStudent} />
          : <EmptyState icon={ClipboardCheck} title="No exams yet">{canManage ? "Exams are timed and can open and close at set times." : "No exams are scheduled."}</EmptyState>}
      </Card>
    </div>
  );
}

async function AnnouncementsTab({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const items = await db.announcement.findMany({ where: { courseId }, orderBy: { createdAt: "desc" }, include: { author: { select: { id: true, name: true, avatarUpdatedAt: true } } } });
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
              <Avatar name={a.author.name} size="sm" src={avatarUrl(a.author)} />
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

async function PeopleTab({
  courseId,
  schoolId,
  canManage,
  teacher,
  joinCode,
}: {
  courseId: string;
  schoolId: string;
  canManage: boolean;
  teacher: { id: string; name: string; email: string; avatarUpdatedAt: Date | null } | null;
  joinCode: string | null;
}) {
  const enrolled = await db.enrollment.findMany({
    where: { courseId },
    include: { user: { select: { id: true, name: true, email: true, gradeLevel: true, avatarUpdatedAt: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const notEnrolled = canManage
    ? await db.user.findMany({
        where: { schoolId, role: "STUDENT", enrollments: { none: { courseId } } },
        select: { id: true, name: true, email: true, gradeLevel: true },
        orderBy: { name: "asc" },
      })
    : [];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Class list" description={`${enrolled.length} students`}
          action={canManage && enrolled.length > 0 && (
            <a href={`mailto:?bcc=${enrolled.map((e) => e.user.email).join(",")}`} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}>
              <Mail className="size-4" aria-hidden />Email class
            </a>
          )} />
        {teacher && (
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
            <Avatar name={teacher.name} size="sm" src={avatarUrl(teacher)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{teacher.name}</p>
              <a href={`mailto:${teacher.email}`} className="block truncate text-xs text-brand-700 hover:underline">{teacher.email}</a>
            </div>
            <Badge tone="brand">Teacher</Badge>
          </div>
        )}
        {enrolled.length === 0 && (
          <EmptyState icon={Users} title="No students yet">
            {canManage ? (joinCode ? `Share the class code ${joinCode} with your students, or add them from the list.` : "Add students from the list.") : "You're the first one here."}
          </EmptyState>
        )}
        <ul className="divide-y divide-slate-100">
          {enrolled.map(({ user: s }) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{s.name}</p>
                {canManage ? (
                  <p className="truncate text-xs text-slate-500">
                    <a href={`mailto:${s.email}`} className="text-brand-700 hover:underline">{s.email}</a>
                    {s.gradeLevel && ` · ${s.gradeLevel}`}
                  </p>
                ) : (
                  <p className="truncate text-xs text-slate-500">{s.gradeLevel}</p>
                )}
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
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-800">{s.name}</span>
                        <span className="block truncate text-xs text-slate-500">{s.email}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton className="mt-4 w-full" pendingText="Adding…">Add selected</SubmitButton>
            </form>
          ) : (
            <p className="p-5 text-sm text-slate-500">Every student in the school is already in this course.</p>
          )}
          <p className="flex items-start gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            Students can also join with the class code shown at the top of the course.
          </p>
        </Card>
      )}
    </div>
  );
}
