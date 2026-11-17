import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { ACCEPT, MAX_UPLOAD_MB } from "@/lib/storage";
import { Card, PageHeader } from "@/components/ui";
import { MaterialForm } from "@/components/material-form";

export const metadata: Metadata = { title: "New module" };

export default async function NewModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(["ADMIN", "TEACHER"]);
  if (!(await canAccessCourse(user, id)).canManage) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New module"
        description="A module is one week or topic. Describe the activities, attach slides or a PDF, then add lessons, assignments and quizzes to it."
      />
      <Card className="p-5 sm:p-6">
        <MaterialForm courseId={id} maxMb={MAX_UPLOAD_MB} accept={ACCEPT} />
      </Card>
    </div>
  );
}
