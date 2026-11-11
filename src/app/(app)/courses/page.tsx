import type { Metadata } from "next";
import { BookOpen, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCourses } from "@/lib/queries";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { CourseCard } from "@/components/lms";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  const user = await requireUser();
  const courses = await getCourses(user);
  const canCreate = user.role !== "STUDENT";
  return (
    <>
      <PageHeader
        title={user.role === "ADMIN" ? "All courses" : "My courses"}
        description={`${courses.length} course${courses.length === 1 ? "" : "s"}`}
        actions={canCreate && <ButtonLink href="/courses/new"><Plus className="size-4" aria-hidden /> New course</ButtonLink>}
      />
      {courses.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => <CourseCard key={c.id} course={c} showProgress={user.role === "STUDENT"} />)}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            action={canCreate && <ButtonLink href="/courses/new">Create course</ButtonLink>}
          >
            {canCreate ? "Create a course to start adding lessons and assignments." : "You aren't enrolled in any courses yet. Your teacher will add you."}
          </EmptyState>
        </Card>
      )}
    </>
  );
}
