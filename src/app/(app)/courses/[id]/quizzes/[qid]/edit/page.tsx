import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Eye, EyeOff, Settings2 } from "lucide-react";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { moduleOptions } from "@/lib/queries";
import { quizSettingsFields } from "@/lib/quiz-form";
import { toQuestion } from "@/lib/quiz";
import { setQuizPublished, updateQuizSettings } from "@/app/quiz-actions";
import { Alert, ButtonLink, Card, focusRing } from "@/components/ui";
import { SimpleForm } from "@/components/simple-form";
import { SubmitButton } from "@/components/submit-button";
import { QuizBuilder } from "@/components/quiz-builder";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit questions" };

export default async function EditQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; qid: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id, qid } = await params;
  const { created } = await searchParams;
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, id)).canManage) notFound();
  const quiz = await db.quiz.findFirst({
    where: { id: qid, courseId: id },
    include: { questions: { orderBy: { position: "asc" } }, course: { select: { title: true } }, _count: { select: { attempts: true } } },
  });
  if (!quiz) notFound();
  const [modules, bankRows] = await Promise.all([
    moduleOptions(id),
    db.bankQuestion.findMany({ where: { schoolId: user.schoolId }, orderBy: [{ category: "asc" }, { createdAt: "desc" }], take: 1000 }),
  ]);
  const bank = bankRows.map((b) => ({ ...toQuestion(b), category: b.category }));
  const label = quiz.kind === "EXAM" ? "exam" : "quiz";

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href={`/courses/${id}?tab=quizzes`} className="hover:text-slate-900 hover:underline">{quiz.course.title}</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li><Link href={`/courses/${id}/quizzes/${qid}`} className="hover:text-slate-900 hover:underline">{quiz.title}</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li aria-current="page" className="font-medium text-slate-700">Questions</li>
        </ol>
      </nav>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight text-slate-900 sm:text-[2.125rem]">{quiz.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{quiz.published ? `Published. Students can see this ${label}.` : `Draft. Students can't see this ${label} until you publish it.`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/courses/${id}/quizzes/${qid}`} variant="secondary">View results</ButtonLink>
          {quiz.questions.length > 0 && (
            <form action={setQuizPublished.bind(null, qid, !quiz.published)}>
              <SubmitButton variant={quiz.published ? "secondary" : "primary"} pendingText="Saving…">
                {quiz.published ? <><EyeOff className="size-4" aria-hidden />Unpublish</> : <><Eye className="size-4" aria-hidden />Publish</>}
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {created && <div className="mb-4"><Alert>Now add your questions, then save and publish.</Alert></div>}

      <details className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className={cn("flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl px-5 text-sm font-semibold text-slate-900 hover:bg-slate-50 [&::-webkit-details-marker]:hidden", focusRing)}>
          <Settings2 className="size-4 text-slate-500" aria-hidden />Settings
          <span className="font-normal text-slate-500">
            · {quiz.timeLimitMin ? `${quiz.timeLimitMin} min` : "no time limit"} · {quiz.maxAttempts ? `${quiz.maxAttempts} attempt${quiz.maxAttempts === 1 ? "" : "s"}` : "unlimited attempts"}
          </span>
        </summary>
        <div className="border-t border-slate-100 p-5">
          <SimpleForm action={updateQuizSettings.bind(null, qid)} submitLabel="Save settings" fields={quizSettingsFields(quiz, modules)} />
        </div>
      </details>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Questions</h2>
      <QuizBuilder quizId={qid} initial={quiz.questions.map(toQuestion)} attemptCount={quiz._count.attempts} bank={bank} defaultCategory={quiz.course.title} />
    </div>
  );
}
