import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CourseForm } from "./course-form";

export const metadata: Metadata = { title: "New course" };

export default async function NewCoursePage() {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const teachers =
    user.role === "ADMIN"
      ? await db.user.findMany({ where: { schoolId: user.schoolId, role: "TEACHER" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create a course" description="You can add lessons, assignments and students after creating it." />
      <CourseForm teachers={teachers} isAdmin={user.role === "ADMIN"} />
    </div>
  );
}
