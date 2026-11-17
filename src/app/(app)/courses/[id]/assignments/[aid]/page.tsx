import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, ChevronRight, Inbox, Trophy } from "lucide-react";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { gradeSubmission, removeSubmissionAttachment, setRubric, type RubricCriterion } from "@/app/actions";
import { RubricEditor, RubricGrader } from "@/components/rubric";
import { Avatar, Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { AssignmentStatus } from "@/components/lms";
import { SimpleForm } from "@/components/simple-form";
import { SubmissionForm } from "@/components/submission-form";
import { AttachmentList } from "@/components/materials";
import { ACCEPT, MAX_UPLOAD_MB } from "@/lib/storage";
import { cn, formatDue, percent, timeAgo, avatarUrl } from "@/lib/utils";

type P = { params: Promise<{ id: string; aid: string }>; searchParams: Promise<{ student?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { aid } = await params;
  const a = await db.assignment.findUnique({ where: { id: aid }, select: { title: true } });
  return { title: a?.title ?? "Assignment" };
}

export default async function AssignmentPage({ params, searchParams }: P) {
  const { id, aid } = await params;
  const { student } = await searchParams;
  const user = await requireUser();
  const access = await canAccessCourse(user, id);
  if (!access.canView) notFound();
  const assignment = await db.assignment.findFirst({ where: { id: aid, courseId: id }, include: { course: { select: { title: true } } } });
  if (!assignment) notFound();

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/courses" className="hover:text-slate-900 hover:underline">Courses</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li><Link href={`/courses/${id}?tab=assignments`} className="hover:text-slate-900 hover:underline">{assignment.course.title}</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li aria-current="page" className="font-medium text-slate-700">{assignment.title}</li>
        </ol>
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight text-slate-900 sm:text-[2.125rem]">{assignment.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4" aria-hidden />Due {formatDue(assignment.dueAt)}</span>
          <span className="inline-flex items-center gap-1.5"><Trophy className="size-4" aria-hidden />{assignment.points} points</span>
        </div>
      </div>

      {access.canManage ? (
        <TeacherView assignment={assignment} courseId={id} selected={student} />
      ) : (
        <StudentView assignment={assignment} userId={user.id} />
      )}
    </>
  );
}

type A = { id: string; instructions: string; points: number; dueAt: Date; rubric: unknown };

const rubricOf = (a: A) => (Array.isArray(a.rubric) ? (a.rubric as RubricCriterion[]) : []);

/** The rubric as a table. With `picked`, the chosen level in each row is highlighted. */
function RubricView({ rubric, picked }: { rubric: RubricCriterion[]; picked?: Record<string, string> }) {
  return (
    <Card>
      <CardHeader title="Rubric" description={picked ? "How your work was marked" : "How your work will be marked"} />
      <div className="divide-y divide-slate-100">
        {rubric.map((c) => (
          <div key={c.id} className="px-5 py-4">
            <p className="mb-2 text-sm font-semibold text-slate-900">{c.title}</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {c.levels.map((l) => {
                const on = picked?.[c.id] === l.id;
                return (
                  <li key={l.id} className={cn("rounded-lg border p-3 text-sm", on ? "border-brand-600 bg-brand-50" : "border-slate-200")}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-900">{l.label}{on && <span className="sr-only"> (your level)</span>}</span>
                      <span className="text-xs text-slate-500">{l.points} pts</span>
                    </span>
                    {l.description && <span className="mt-1 block text-xs text-slate-600">{l.description}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Instructions({ text }: { text: string }) {
  return (
    <Card>
      <CardHeader title="Instructions" />
      <p className="whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-slate-700 sm:text-base">{text}</p>
    </Card>
  );
}

const attachmentInclude = { attachments: { orderBy: { createdAt: "asc" as const }, include: { file: { select: { id: true, name: true, size: true, mime: true } } } } };

async function StudentView({ assignment, userId }: { assignment: A; userId: string }) {
  const sub = await db.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: userId } },
    include: attachmentInclude,
  });
  const pct = percent(sub?.score, assignment.points);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Instructions text={assignment.instructions} />
        {rubricOf(assignment).length > 0 && (
          <RubricView rubric={rubricOf(assignment)} picked={sub?.gradedAt ? ((sub.rubricScores ?? {}) as Record<string, string>) : undefined} />
        )}
        <Card>
          <CardHeader title="Your work" action={<AssignmentStatus dueAt={assignment.dueAt} points={assignment.points} submission={sub ?? undefined} />} />
          <div className="space-y-5 p-5">
            {sub && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Handed in {timeAgo(sub.submittedAt)}{sub.submittedAt > assignment.dueAt && <span className="font-medium text-amber-700"> (late)</span>}.
                  {!sub.gradedAt && " You can change it until it's graded."}
                </p>
                {sub.gradedAt && sub.content && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-4 text-sm text-slate-700">{sub.content}</p>}
                <AttachmentList items={sub.attachments} removeAction={sub.gradedAt ? undefined : (id) => removeSubmissionAttachment.bind(null, id)} />
              </div>
            )}
            {!sub?.gradedAt && (
              <SubmissionForm
                assignmentId={assignment.id}
                maxMb={MAX_UPLOAD_MB}
                accept={ACCEPT}
                defaultContent={sub?.content ?? ""}
                existingCount={sub?.attachments.length ?? 0}
                isUpdate={!!sub}
              />
            )}
          </div>
        </Card>
      </div>
      <Card className="self-start">
        <CardHeader title="Grade" />
        {sub?.gradedAt ? (
          <div className="p-5">
            <p className="text-4xl font-semibold tracking-tight text-slate-900">
              {sub.score}<span className="text-lg font-normal text-slate-500">/{assignment.points}</span>
            </p>
            <p className="mt-1 text-sm text-emerald-700">{pct}% · graded {timeAgo(sub.gradedAt)}</p>
            {sub.feedback && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher feedback</p>
                <p className="mt-1 text-sm text-slate-700">{sub.feedback}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-500">{sub ? "Your teacher hasn't graded this yet." : "Submit your work to get a grade."}</p>
        )}
      </Card>
    </div>
  );
}

async function TeacherView({ assignment, courseId, selected }: { assignment: A; courseId: string; selected?: string }) {
  const [enrolled, subs] = await Promise.all([
    db.enrollment.findMany({ where: { courseId }, include: { user: { select: { id: true, name: true, email: true, avatarUpdatedAt: true } } }, orderBy: { user: { name: "asc" } } }),
    db.submission.findMany({ where: { assignmentId: assignment.id }, include: attachmentInclude }),
  ]);
  const byStudent = new Map(subs.map((s) => [s.studentId, s]));
  const current = selected ? enrolled.find((e) => e.user.id === selected)?.user : undefined;
  const currentSub = current ? byStudent.get(current.id) : undefined;
  const graded = subs.filter((s) => s.gradedAt).length;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Submissions" description={`${subs.length} of ${enrolled.length} turned in · ${graded} graded`} />
          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {enrolled.map(({ user: s }) => {
              const sub = byStudent.get(s.id);
              const active = s.id === selected;
              return (
                <li key={s.id}>
                  <Link
                    href={`?student=${s.id}#grade`}
                    scroll={false}
                    aria-current={active ? "true" : undefined}
                    className={cn("flex items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none", active && "bg-brand-50 hover:bg-brand-50")}
                  >
                    <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{s.name}</span>
                    {sub?.gradedAt ? (
                      <Badge tone="success">{sub.score}/{assignment.points}</Badge>
                    ) : sub ? (
                      <Badge tone="warning">Needs grading</Badge>
                    ) : (
                      <Badge tone={assignment.dueAt < new Date() ? "danger" : "neutral"}>{assignment.dueAt < new Date() ? "Missing" : "Not submitted"}</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        <Instructions text={assignment.instructions} />
        <Card>
          <CardHeader title="Rubric" description={rubricOf(assignment).length ? `${rubricOf(assignment).length} criteria · out of ${assignment.points} points` : undefined} />
          <RubricEditor initial={rubricOf(assignment)} save={setRubric.bind(null, assignment.id)} />
        </Card>
      </div>

      <div id="grade" className="scroll-mt-20 lg:col-span-3">
        <Card className="lg:sticky lg:top-6">
          {current ? (
            <>
              <CardHeader
                title={current.name}
                description={
                  <>
                    <a href={`mailto:${current.email}`} className="text-brand-700 hover:underline">{current.email}</a>
                    {" · "}
                    {currentSub ? `Handed in ${timeAgo(currentSub.submittedAt)}${currentSub.submittedAt > assignment.dueAt ? " (late)" : ""}` : "No submission yet"}
                  </>
                }
              />
              <div className="space-y-5 p-5">
                {currentSub ? (
                  <>
                    {currentSub.content && (
                      <div className="whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{currentSub.content}</div>
                    )}
                    <AttachmentList items={currentSub.attachments} />
                    {currentSub.gradedAt && (
                      <p className="flex items-center gap-2 text-sm text-emerald-700">
                        <CheckCircle2 className="size-4" aria-hidden /> Graded {currentSub.score}/{assignment.points} — you can change the grade below.
                      </p>
                    )}
                    {rubricOf(assignment).length ? (
                      <RubricGrader
                        key={currentSub.id}
                        rubric={rubricOf(assignment)}
                        scores={(currentSub.rubricScores ?? {}) as Record<string, string>}
                        feedback={currentSub.feedback ?? ""}
                        action={gradeSubmission.bind(null, currentSub.id)}
                      />
                    ) : (
                      <SimpleForm
                        key={currentSub.id}
                        action={gradeSubmission.bind(null, currentSub.id)}
                        submitLabel="Save grade"
                        fields={[
                          { name: "score", label: `Score (out of ${assignment.points})`, type: "number", required: true, min: 0, max: assignment.points, defaultValue: currentSub.score?.toString(), half: true },
                          { name: "feedback", label: "Feedback for the student", type: "textarea", rows: 4, defaultValue: currentSub.feedback ?? "", placeholder: "What went well, and one thing to improve." },
                        ]}
                      />
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">This student hasn't submitted anything yet.</p>
                )}
              </div>
            </>
          ) : (
            <EmptyState icon={Inbox} title="Select a student">Choose a student from the list to read their work and give a grade.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
