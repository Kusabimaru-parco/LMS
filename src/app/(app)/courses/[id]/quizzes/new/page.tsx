import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { createQuiz } from "@/app/quiz-actions";
import { moduleOptions } from "@/lib/queries";
import { defaultSettings, quizSettingsFields } from "@/lib/quiz-form";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { SimpleForm } from "@/components/simple-form";

export const metadata: Metadata = { title: "New quiz" };

export default async function NewQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; module?: string }>;
}) {
  const { id } = await params;
  const { kind = "QUIZ", module: moduleId = "" } = await searchParams;
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, id)).canManage) notFound();
  const modules = await moduleOptions(id);
  const isExam = kind === "EXAM";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={isExam ? "New exam" : "New quiz"}
        description={isExam
          ? "Exams are timed and taken once by default. Next you'll add the questions; students won't see it until you publish."
          : "Quizzes are marked automatically. Next you'll add the questions; students won't see it until you publish."}
      />
      <Card className="p-5 sm:p-6">
        <SimpleForm
          action={createQuiz.bind(null, id)}
          submitLabel="Continue to questions"
          pendingLabel="Creating…"
          footer={<ButtonLink href={moduleId ? `/courses/${id}/modules/${moduleId}` : `/courses/${id}?tab=quizzes`} variant="secondary">Cancel</ButtonLink>}
          fields={quizSettingsFields({ ...defaultSettings(isExam ? "EXAM" : "QUIZ"), moduleId: modules.some((m) => m.value === moduleId) ? moduleId : "" }, modules)}
        />
      </Card>
    </div>
  );
}
