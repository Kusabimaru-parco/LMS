import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { createAssignment } from "@/app/actions";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { SimpleForm } from "@/components/simple-form";
import { toLocalInput } from "@/lib/utils";

export const metadata: Metadata = { title: "New assignment" };

export default async function NewAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, id)).canManage) notFound();
  const due = new Date(Date.now() + 7 * 86_400_000);
  due.setHours(23, 59, 0, 0);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New assignment" description="Students will see it right away in their upcoming work." />
      <Card className="p-5 sm:p-6">
        <SimpleForm
          action={createAssignment.bind(null, id)}
          submitLabel="Create assignment"
          pendingLabel="Creating…"
          footer={<ButtonLink href={`/courses/${id}?tab=assignments`} variant="secondary">Cancel</ButtonLink>}
          fields={[
            { name: "title", label: "Title", required: true, placeholder: "e.g. Problem set 3" },
            { name: "instructions", label: "Instructions", type: "textarea", rows: 8, required: true, hint: "Explain what to do and how it will be graded." },
            { name: "dueAt", label: "Due date and time", type: "datetime-local", required: true, defaultValue: toLocalInput(due), half: true },
            { name: "points", label: "Points", type: "number", required: true, defaultValue: "100", min: 1, max: 1000, half: true },
          ]}
        />
      </Card>
    </div>
  );
}
