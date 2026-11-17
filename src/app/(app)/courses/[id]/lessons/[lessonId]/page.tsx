import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toggleLessonComplete } from "@/app/actions";
import { ButtonLink, Card } from "@/components/ui";
import { LessonContent } from "@/components/lms";
import { SubmitButton } from "@/components/submit-button";

type P = { params: Promise<{ id: string; lessonId: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lessonId } = await params;
  const l = await db.lesson.findUnique({ where: { id: lessonId }, select: { title: true } });
  return { title: l?.title ?? "Lesson" };
}

export default async function LessonPage({ params }: P) {
  const { id, lessonId } = await params;
  const user = await requireUser();
  if (!(await canAccessCourse(user, id)).canView) notFound();

  const course = await db.course.findUnique({
    where: { id },
    select: { title: true, lessons: { orderBy: { position: "asc" }, select: { id: true, title: true } } },
  });
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, courseId: id },
    include: { progress: { where: { userId: user.id } } },
  });
  if (!course || !lesson) notFound();
  const idx = course.lessons.findIndex((l) => l.id === lessonId);
  const prev = course.lessons[idx - 1];
  const next = course.lessons[idx + 1];
  const done = lesson.progress.length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/courses" className="hover:text-slate-900 hover:underline">Courses</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li><Link href={`/courses/${id}`} className="hover:text-slate-900 hover:underline">{course.title}</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li aria-current="page" className="font-medium text-slate-700">Lesson {idx + 1}</li>
        </ol>
      </nav>

      <article>
        <Card className="p-5 sm:p-8">
          <p className="text-sm font-medium text-brand-700">Lesson {idx + 1} of {course.lessons.length}</p>
          <h1 className="mt-1 font-display text-[1.75rem] font-semibold leading-tight text-slate-900 sm:text-3xl">{lesson.title}</h1>
          <div className="mt-6 text-base">
            <LessonContent text={lesson.content} />
          </div>
          {user.role === "STUDENT" && (
            <form action={toggleLessonComplete.bind(null, id, lessonId)} className="mt-8 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-slate-700">
                {done ? (
                  <><CheckCircle2 className="size-5 text-emerald-600" aria-hidden /> You've completed this lesson.</>
                ) : (
                  "Finished reading? Mark it complete to track your progress."
                )}
              </p>
              <SubmitButton variant={done ? "secondary" : "primary"} pendingText="Saving…">
                {done ? "Mark as not done" : "Mark complete"}
              </SubmitButton>
            </form>
          )}
        </Card>
      </article>

      <nav aria-label="Lesson navigation" className="mt-6 grid grid-cols-2 gap-3">
        {prev ? (
          <ButtonLink href={`/courses/${id}/lessons/${prev.id}`} variant="secondary" className="justify-start">
            <ArrowLeft className="size-4 shrink-0" aria-hidden /><span className="truncate">Previous</span>
          </ButtonLink>
        ) : <span />}
        {next ? (
          <ButtonLink href={`/courses/${id}/lessons/${next.id}`} variant="secondary" className="justify-end">
            <span className="truncate">Next lesson</span><ArrowRight className="size-4 shrink-0" aria-hidden />
          </ButtonLink>
        ) : (
          <ButtonLink href={`/courses/${id}`} variant="secondary" className="justify-end">Back to course</ButtonLink>
        )}
      </nav>
    </div>
  );
}
