import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { createLesson } from "@/app/actions";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { SimpleForm } from "@/components/simple-form";

export const metadata: Metadata = { title: "Add lesson" };

export default async function NewLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, id)).canManage) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add a lesson" description="Write the lesson students will read. Use ## for headings and - for bullet points." />
      <Card className="p-5 sm:p-6">
        <SimpleForm
          action={createLesson.bind(null, id)}
          submitLabel="Publish lesson"
          pendingLabel="Publishing…"
          footer={<ButtonLink href={`/courses/${id}`} variant="secondary">Cancel</ButtonLink>}
          fields={[
            { name: "title", label: "Lesson title", required: true, placeholder: "e.g. 6. Quadratic functions" },
            { name: "content", label: "Lesson content", type: "textarea", rows: 14, required: true, hint: "Tip: keep paragraphs short and add a 'Learning goals' list at the top." },
          ]}
        />
      </Card>
    </div>
  );
}
