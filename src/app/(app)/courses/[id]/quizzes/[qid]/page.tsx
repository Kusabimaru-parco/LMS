import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronRight, ClipboardCheck, Eye, EyeOff, ListChecks, Pencil, Play, RefreshCw, RotateCcw, Timer, Trash2, Trophy } from "lucide-react";
import { canAccessCourse, requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { closeExpiredAttempts, bestAttempts } from "@/lib/attempts";
import { formatScore, quizState, resultsVisible, SHOW_RESULTS } from "@/lib/quiz";
import { deleteQuiz, regradeQuiz, setQuizPublished, startAttempt } from "@/app/quiz-actions";
import { Alert, Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, Stat, focusRing } from "@/components/ui";
import { LessonContent } from "@/components/lms";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { cn, formatDue, percent, avatarUrl } from "@/lib/utils";

type P = { params: Promise<{ id: string; qid: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { qid } = await params;
  const q = await db.quiz.findUnique({ where: { id: qid }, select: { title: true } });
  return { title: q?.title ?? "Quiz" };
}

const STATE_BADGE = {
  draft: <Badge>Draft · only you can see it</Badge>,
  upcoming: <Badge tone="brand">Not open yet</Badge>,
  open: <Badge tone="success">Open</Badge>,
  closed: <Badge tone="danger">Closed</Badge>,
};

export default async function QuizPage({ params }: P) {
  const { id, qid } = await params;
  const user = await requireUser();
  const access = await canAccessCourse(user, id);
  if (!access.canView) notFound();
  const quiz = await db.quiz.findFirst({
    where: { id: qid, courseId: id, ...(access.canManage ? {} : { published: true }) },
    include: { course: { select: { title: true } }, questions: { select: { points: true } } },
  });
  if (!quiz) notFound();
  const state = quizState(quiz);
  const totalPoints = quiz.questions.reduce((s, q) => s + q.points, 0);
  const label = quiz.kind === "EXAM" ? "Exam" : "Quiz";

  const facts = [
    {
      icon: ListChecks, label: "Questions",
      value: quiz.drawCount && quiz.drawCount < quiz.questions.length
        ? `${quiz.drawCount} picked at random from ${quiz.questions.length}`
        : `${quiz.questions.length} · ${totalPoints} points`,
    },
    { icon: Timer, label: "Time limit", value: quiz.timeLimitMin ? `${quiz.timeLimitMin} minutes` : "No limit" },
    { icon: RotateCcw, label: "Attempts", value: quiz.maxAttempts ? `${quiz.maxAttempts} allowed` : "Unlimited (best score counts)" },
    { icon: CalendarClock, label: "Open", value: [quiz.opensAt ? `From ${formatDue(quiz.opensAt)}` : null, quiz.closesAt ? `until ${formatDue(quiz.closesAt)}` : null].filter(Boolean).join(" ") || "Any time" },
    { icon: Eye, label: "Results", value: SHOW_RESULTS.find((s) => s.value === quiz.showResults)?.label ?? "" },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/courses" className="hover:text-slate-900 hover:underline">Courses</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li><Link href={`/courses/${id}?tab=quizzes`} className="hover:text-slate-900 hover:underline">{quiz.course.title}</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li aria-current="page" className="font-medium text-slate-700">{quiz.title}</li>
        </ol>
      </nav>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-brand-700">
            {quiz.kind === "EXAM" ? <ClipboardCheck className="size-4" aria-hidden /> : <Timer className="size-4" aria-hidden />}{label}
          </p>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight text-slate-900 sm:text-[2.125rem]">{quiz.title}</h1>
          <div className="mt-2">{STATE_BADGE[state]}</div>
        </div>
        {access.canManage && (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/courses/${id}/quizzes/${qid}/edit`} variant="secondary"><Pencil className="size-4" aria-hidden />Edit questions</ButtonLink>
            <form action={setQuizPublished.bind(null, qid, !quiz.published)}>
              <SubmitButton variant={quiz.published ? "secondary" : "primary"} pendingText="Saving…">
                {quiz.published ? <><EyeOff className="size-4" aria-hidden />Unpublish</> : <><Eye className="size-4" aria-hidden />Publish</>}
              </SubmitButton>
            </form>
          </div>
        )}
      </div>

      {access.canManage && !quiz.published && quiz.questions.length === 0 && (
        <div className="mb-6"><Alert tone="info">Add at least one question before publishing.</Alert></div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {access.canManage ? <Results quizId={qid} courseId={id} totalPoints={totalPoints} /> : <StudentPanel user={user} quiz={quiz} state={state} label={label} />}
          {quiz.description && (
            <Card>
              <CardHeader title="Instructions" />
              <div className="px-5 py-4 text-base"><LessonContent text={quiz.description} /></div>
            </Card>
          )}
        </div>
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100">
              {facts.map((f) => (
                <div key={f.label} className="flex items-start gap-3 px-5 py-3">
                  <f.icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-xs text-slate-500">{f.label}</dt>
                    <dd className="text-sm font-medium text-slate-900">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>
          {access.canManage && (
            <Card className="p-5">
              <div className="flex flex-col gap-2">
                <form action={regradeQuiz.bind(null, qid)}>
                  <ConfirmButton message="Re-mark every submitted attempt with the current correct answers? Essay marks are kept; hand-changed marks on other questions are replaced."
                    className={cn("inline-flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100", focusRing)}>
                    <RefreshCw className="size-4" aria-hidden />Regrade attempts
                  </ConfirmButton>
                </form>
                <form action={deleteQuiz.bind(null, qid)}>
                  <ConfirmButton message={`Delete "${quiz.title}" and every student's answers? This can't be undone.`}
                    className={cn("inline-flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-rose-700 hover:bg-rose-50", focusRing)}>
                    <Trash2 className="size-4" aria-hidden />Delete {label.toLowerCase()}
                  </ConfirmButton>
                </form>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

async function StudentPanel({
  user,
  quiz,
  state,
  label,
}: {
  user: CurrentUser;
  quiz: { id: string; courseId: string; kind: string; maxAttempts: number; timeLimitMin: number | null; showResults: string; closesAt: Date | null; opensAt: Date | null; questions: unknown[] };
  state: ReturnType<typeof quizState>;
  label: string;
}) {
  await closeExpiredAttempts({ quizId: quiz.id, studentId: user.id });
  const attempts = await db.quizAttempt.findMany({ where: { quizId: quiz.id, studentId: user.id }, orderBy: { startedAt: "asc" } });
  const inProgress = attempts.find((a) => !a.submittedAt);
  const used = attempts.length;
  const left = quiz.maxAttempts ? Math.max(0, quiz.maxAttempts - used) : Infinity;
  const visible = resultsVisible(quiz);
  const best = bestAttempts(attempts.map((a) => ({ ...a }))).get(`${quiz.id}:${user.id}`);

  let action: React.ReactNode = null;
  if (inProgress) {
    action = (
      <form action={startAttempt.bind(null, quiz.id)}>
        <SubmitButton pendingText="Opening…"><Play className="size-4" aria-hidden />Continue attempt</SubmitButton>
      </form>
    );
  } else if (state === "open" && left > 0 && quiz.questions.length) {
    action = (
      <form action={startAttempt.bind(null, quiz.id)}>
        <SubmitButton pendingText="Starting…"><Play className="size-4" aria-hidden />{used ? "Try again" : `Start ${label.toLowerCase()}`}</SubmitButton>
      </form>
    );
  }
  const note =
    inProgress ? "You have an attempt in progress. Your answers were saved."
    : state === "upcoming" ? `This ${label.toLowerCase()} opens ${formatDue(quiz.opensAt!)}.`
    : state === "closed" ? `This ${label.toLowerCase()} is closed.`
    : left <= 0 ? "You've used all your attempts."
    : quiz.timeLimitMin ? `You'll have ${quiz.timeLimitMin} minutes once you start. The timer keeps running if you close the page.`
    : "Take your time. Your answers are saved as you go.";

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-slate-900">
              {best && visible.score ? <>Best score: {formatScore(best.score)}/{best.maxScore} ({percent(best.score, best.maxScore)}%)</> : used ? "Submitted" : `Ready when you are`}
            </p>
            <p className="mt-1 text-sm text-slate-600">{note}</p>
            {quiz.kind === "EXAM" && !inProgress && state === "open" && left > 0 && (
              <p className="mt-1 text-sm text-slate-600">Stay on this page during the exam. Leaving it is recorded for your teacher.</p>
            )}
          </div>
          {action}
        </div>
      </Card>
      {attempts.filter((a) => a.submittedAt).length > 0 && (
        <Card>
          <CardHeader title="Your attempts" description={quiz.maxAttempts ? `${used} of ${quiz.maxAttempts} used` : undefined} />
          <ul className="divide-y divide-slate-100">
            {attempts.filter((a) => a.submittedAt).map((a, i) => (
              <li key={a.id}>
                <Link href={`/courses/${quiz.courseId}/quizzes/${quiz.id}/attempts/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                  <span className="flex-1 text-sm font-medium text-slate-900">Attempt {i + 1}</span>
                  <span className="text-xs text-slate-500">{formatDue(a.submittedAt!)}</span>
                  {a.needsReview ? <Badge tone="brand">Waiting for grade</Badge>
                    : visible.score ? <Badge tone="success">{formatScore(a.score)}/{a.maxScore}</Badge> : <Badge>Submitted</Badge>}
                  <ChevronRight className="size-4 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

async function Results({ quizId, courseId, totalPoints }: { quizId: string; courseId: string; totalPoints: number }) {
  await closeExpiredAttempts({ quizId });
  const [enrolled, attempts] = await Promise.all([
    db.enrollment.findMany({ where: { courseId }, include: { user: { select: { id: true, name: true, email: true, avatarUpdatedAt: true } } }, orderBy: { user: { name: "asc" } } }),
    db.quizAttempt.findMany({ where: { quizId }, orderBy: { startedAt: "asc" } }),
  ]);
  const best = bestAttempts(attempts);
  const submitted = [...best.values()];
  const avg = submitted.length ? Math.round(submitted.reduce((s, a) => s + (percent(a.score, a.maxScore) ?? 0), 0) / submitted.length) : null;
  const review = attempts.filter((a) => a.needsReview).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <Stat label="Submitted" value={`${submitted.length}/${enrolled.length}`} icon={ClipboardCheck} />
        <Stat label="Average" value={avg == null ? "—" : `${avg}%`} icon={Trophy} hint={`Out of ${totalPoints} points`} />
        <Stat label="To review" value={review} icon={Pencil} hint={review ? "Essays waiting for points" : "Nothing to mark"} />
      </div>
      <Card>
        <CardHeader title="Results" description="Best attempt per student" />
        {enrolled.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No students yet">Students will appear here once they join the course.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {enrolled.map(({ user: s }) => {
              const mine = attempts.filter((a) => a.studentId === s.id);
              const b = best.get(`${quizId}:${s.id}`);
              const open = mine.find((a) => !a.submittedAt);
              const target = b ?? open;
              const row = (
                <>
                  <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{s.name}</span>
                    <span className="block truncate text-xs text-slate-500">{s.email}{mine.length > 1 ? ` · ${mine.length} attempts` : ""}{b && b.focusLost > 0 ? ` · left page ${b.focusLost}×` : ""}</span>
                  </span>
                  {b ? (
                    b.needsReview ? <Badge tone="warning">Needs grading</Badge> : <Badge tone="success">{formatScore(b.score)}/{b.maxScore}</Badge>
                  ) : open ? <Badge tone="brand">In progress</Badge> : <Badge>Not started</Badge>}
                </>
              );
              return (
                <li key={s.id}>
                  {target ? (
                    <Link href={`/courses/${courseId}/quizzes/${quizId}/attempts/${target.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">{row}</Link>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-3">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
