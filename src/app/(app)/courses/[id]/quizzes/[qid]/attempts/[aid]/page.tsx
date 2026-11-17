import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, XCircle } from "lucide-react";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { attemptQuestions, finalizeAttempt } from "@/lib/attempts";
import { DEADLINE_GRACE_MS, formatScore, publicQuestion, resultsVisible, toQuestion, typeLabel, type AnswerMap, type AwardMap, type QuestionData } from "@/lib/quiz";
import { gradeAttemptManually } from "@/app/quiz-actions";
import { Alert, ButtonLink, Card, Input } from "@/components/ui";
import { QuizRunner } from "@/components/quiz-runner";
import { AttemptGradeForm } from "@/components/attempt-grade-form";
import { cn, formatDue, percent } from "@/lib/utils";

type P = { params: Promise<{ id: string; qid: string; aid: string }>; searchParams: Promise<{ submitted?: string }> };

export const metadata: Metadata = { title: "Attempt" };

export default async function AttemptPage({ params, searchParams }: P) {
  const { id, qid, aid } = await params;
  const { submitted } = await searchParams;
  const user = await requireUser();
  const access = await canAccessCourse(user, id);
  let attempt = await db.quizAttempt.findFirst({
    where: { id: aid, quizId: qid },
    include: { quiz: { include: { questions: { orderBy: { position: "asc" } }, course: { select: { title: true } } } }, student: { select: { name: true, email: true } } },
  });
  if (!attempt || attempt.quiz.courseId !== id) notFound();
  const isOwner = attempt.studentId === user.id;
  if (!(access.canManage || (access.canView && isOwner))) notFound();

  const { quiz } = attempt;
  const all = quiz.questions.map(toQuestion);
  const order = (attempt.questionOrder ?? []) as string[];
  const ordered = attemptQuestions(quiz, all, order);
  const label = quiz.kind === "EXAM" ? "Exam" : "Quiz";

  // Time ran out while away: submit with the saved answers.
  if (!attempt.submittedAt && attempt.deadlineAt && Date.now() > attempt.deadlineAt.getTime() + DEADLINE_GRACE_MS) {
    await finalizeAttempt(attempt.id);
    attempt = { ...attempt, ...(await db.quizAttempt.findUniqueOrThrow({ where: { id: aid } })) };
  }

  const crumbs = (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1">
        <li><Link href={`/courses/${id}?tab=quizzes`} className="hover:text-slate-900 hover:underline">{quiz.course.title}</Link></li>
        <li aria-hidden><ChevronRight className="size-4" /></li>
        <li><Link href={`/courses/${id}/quizzes/${qid}`} className="hover:text-slate-900 hover:underline">{quiz.title}</Link></li>
        <li aria-hidden><ChevronRight className="size-4" /></li>
        <li aria-current="page" className="font-medium text-slate-700">{isOwner ? "Your attempt" : attempt.student.name}</li>
      </ol>
    </nav>
  );

  if (!attempt.submittedAt) {
    if (!isOwner) {
      return (
        <div className="mx-auto max-w-3xl">
          {crumbs}
          <Alert tone="info">{attempt.student.name} is still working on this attempt{attempt.deadlineAt ? ` (time ends ${formatDue(attempt.deadlineAt)})` : ""}.</Alert>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl">
        {crumbs}
        <h1 className="mb-4 font-display text-[1.75rem] font-semibold leading-tight text-slate-900">{quiz.title}</h1>
        <QuizRunner
          attemptId={attempt.id}
          kind={quiz.kind}
          questions={ordered.map(publicQuestion)}
          initialAnswers={(attempt.answers ?? {}) as AnswerMap}
          deadlineAt={attempt.deadlineAt?.toISOString() ?? null}
          serverNow={new Date().toISOString()}
          initialFocusLost={attempt.focusLost}
        />
      </div>
    );
  }

  const visible = access.canManage ? { score: true, answers: true } : resultsVisible(quiz);
  const answers = (attempt.answers ?? {}) as AnswerMap;
  const awarded = (attempt.awarded ?? {}) as AwardMap;
  const pct = percent(attempt.score, attempt.maxScore);

  const review = (
    <div className="space-y-4">
      {ordered.map((q, i) => (
        <QuestionReview key={q.id} q={q} n={i + 1} answer={answers[q.id]} points={q.id in awarded ? awarded[q.id] : null}
          showAnswers={visible.answers} showScore={visible.score} editable={access.canManage} />
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      {crumbs}
      {submitted && isOwner && <div className="mb-4"><Alert>Your {label.toLowerCase()} was submitted.</Alert></div>}

      <Card className="mb-6 p-5 sm:p-6">
        <p className="text-sm font-medium text-brand-700">{access.canManage ? `${attempt.student.name} · ${attempt.student.email}` : label}</p>
        <h1 className="mt-1 font-display text-[1.75rem] font-semibold leading-tight text-slate-900">{quiz.title}</h1>
        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
          {visible.score ? (
            <p className="text-4xl font-semibold tracking-tight text-slate-900">
              {formatScore(attempt.score)}<span className="text-lg font-normal text-slate-500">/{attempt.maxScore}</span>
              <span className="ml-2 text-base font-medium text-slate-600">{pct}%</span>
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Results will be shown {quiz.showResults === "AFTER_CLOSE" && quiz.closesAt ? `after ${formatDue(quiz.closesAt)}` : "when your teacher releases them"}.
            </p>
          )}
          <p className="text-sm text-slate-500">Submitted {formatDue(attempt.submittedAt)}</p>
        </div>
        {attempt.needsReview && (
          <p className="mt-3 text-sm font-medium text-amber-700">
            {access.canManage ? "Some answers need your points." : "Some answers are waiting for your teacher to grade them. Your score may go up."}
          </p>
        )}
        {access.canManage && attempt.focusLost > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-amber-800">
            <AlertTriangle className="size-4" aria-hidden />Left the page {attempt.focusLost} time{attempt.focusLost === 1 ? "" : "s"} during the attempt.
          </p>
        )}
        {!access.canManage && attempt.feedback && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher feedback</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{attempt.feedback}</p>
          </div>
        )}
      </Card>

      {access.canManage ? (
        <AttemptGradeForm action={gradeAttemptManually.bind(null, attempt.id)} feedback={attempt.feedback ?? ""}>{review}</AttemptGradeForm>
      ) : visible.score || visible.answers ? (
        review
      ) : null}

      <div className="mt-6">
        <ButtonLink href={`/courses/${id}/quizzes/${qid}`} variant="secondary">Back to {label.toLowerCase()}</ButtonLink>
      </div>
    </div>
  );
}

function QuestionReview({
  q,
  n,
  answer,
  points,
  showAnswers,
  showScore,
  editable,
}: {
  q: QuestionData;
  n: number;
  answer: string | string[] | undefined;
  points: number | null;
  showAnswers: boolean;
  showScore: boolean;
  editable: boolean;
}) {
  const picked = new Set(Array.isArray(answer) ? answer : answer ? [answer] : []);
  const full = points != null && points >= q.points;
  const none = points === 0;
  return (
    <Card>
      <div className="p-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question {n} · {typeLabel(q.type)}</p>
          {showScore && (
            <p className={cn("shrink-0 text-sm font-semibold", points == null ? "text-amber-700" : full ? "text-emerald-700" : none ? "text-rose-700" : "text-slate-700")}>
              {points == null ? "Needs grading" : `${formatScore(points)}/${q.points}`}
            </p>
          )}
        </div>
        <p className="whitespace-pre-line text-base font-medium text-slate-900">{q.prompt}</p>

        {q.options.length > 0 && (
          <ul className="mt-3 space-y-2">
            {q.options.map((o) => {
              const chose = picked.has(o.id);
              const tone = showAnswers ? (o.correct ? "correct" : chose ? "wrong" : "none") : chose ? "chosen" : "none";
              return (
                <li key={o.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                  tone === "correct" ? "border-emerald-300 bg-emerald-50" : tone === "wrong" ? "border-rose-300 bg-rose-50" : tone === "chosen" ? "border-brand-300 bg-brand-50" : "border-slate-200")}>
                  {tone === "correct" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden /> : tone === "wrong" ? <XCircle className="size-4 shrink-0 text-rose-600" aria-hidden /> : <Circle className={cn("size-4 shrink-0", chose ? "fill-brand-600 text-brand-600" : "text-slate-300")} aria-hidden />}
                  <span className="flex-1 text-slate-800">{o.text}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {chose && "Your answer"}{chose && showAnswers && o.correct && " · "}{showAnswers && o.correct && "Correct answer"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {(q.type === "SHORT" || q.type === "ESSAY") && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500">Answer</p>
            <p className="mt-1 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{typeof answer === "string" && answer.trim() ? answer : <span className="text-slate-400">No answer</span>}</p>
            {q.type === "SHORT" && showAnswers && <p className="mt-2 text-sm text-slate-600">Accepted: {q.answers.join(", ")}</p>}
          </div>
        )}

        {showAnswers && q.explanation && (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900"><span className="font-medium">Explanation: </span>{q.explanation}</p>
        )}

        {editable && (
          <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
            <label htmlFor={`q_${q.id}`} className="text-sm font-medium text-slate-700">Points <span className="font-normal text-slate-500">(out of {q.points})</span></label>
            <Input id={`q_${q.id}`} name={`q_${q.id}`} type="number" min={0} max={q.points} step="0.5" defaultValue={points ?? ""} className="w-24"
              placeholder={points == null ? "—" : undefined} />
          </div>
        )}
      </div>
    </Card>
  );
}
