import type { Metadata } from "next";
import { BookOpen, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCourses } from "@/lib/queries";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { CourseCard } from "@/components/lms";
import { SimpleForm } from "@/components/simple-form";
import { joinCourse } from "@/app/actions";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  const user = await requireUser(["ADMIN", "TEACHER", "STUDENT"]);
  const courses = await getCourses(user);
  const canCreate = user.role !== "STUDENT";
  return (
    <>
      <PageHeader
        title={user.role === "ADMIN" ? "All courses" : "My courses"}
        description={`${courses.length} course${courses.length === 1 ? "" : "s"}`}
        actions={canCreate && <ButtonLink href="/courses/new"><Plus className="size-4" aria-hidden /> New course</ButtonLink>}
      />
      {user.role === "STUDENT" && (
        <Card className="mb-6">
          <CardHeader title="Join a class" description="Type the class code your teacher gave you." />
          <div className="p-5">
            <SimpleForm
              action={joinCourse}
              submitLabel="Join class"
              pendingLabel="Joining…"
              className="sm:[&>div:last-child]:justify-start"
              fields={[{ name: "code", label: "Class code", required: true, placeholder: "e.g. K7QM2X", autoComplete: "off" }]}
            />
          </div>
        </Card>
      )}
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
            {canCreate ? "Create a course to start adding lessons and assignments." : "You aren't in any classes yet. Join one with a class code above, or wait for your teacher to add you."}
          </EmptyState>
        </Card>
      )}
    </>
  );
}
