import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAssignments } from "@/lib/queries";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { AssignmentRow, AssignmentStatus } from "@/components/lms";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsPage() {
  const user = await requireUser(["ADMIN", "TEACHER", "STUDENT"]);
  const all = await getAssignments(user);
  const now = new Date();
  const week = new Date(Date.now() + 7 * 86_400_000);
  const isStudent = user.role === "STUDENT";

  type Item = (typeof all)[number];
  const groups: { title: string; description?: string; items: Item[] }[] = isStudent
    ? [
        { title: "Missing", description: "Past due and not submitted", items: all.filter((a) => a.dueAt < now && !a.submissions[0]) },
        { title: "Due this week", items: all.filter((a) => a.dueAt >= now && a.dueAt <= week) },
        { title: "Later", items: all.filter((a) => a.dueAt > week) },
        { title: "Done", items: all.filter((a) => a.dueAt < now && a.submissions[0]).reverse() },
      ]
    : [
        { title: "Needs grading", items: all.filter((a) => a.submissions.some((s) => !s.gradedAt)) },
        { title: "Upcoming", items: all.filter((a) => a.dueAt >= now) },
        { title: "Past", items: all.filter((a) => a.dueAt < now && !a.submissions.some((s) => !s.gradedAt)).reverse() },
      ];

  return (
    <>
      <PageHeader title="Assignments" description={isStudent ? "Everything you need to hand in, across all your courses." : "Assignments across your courses."} />
      {all.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title="No assignments yet">Assignments will show up here once they are created.</EmptyState></Card>
      ) : (
        <div className="space-y-6">
          {groups.filter((g) => g.items.length).map((g) => (
            <Card key={g.title}>
              <CardHeader title={<span className="flex items-center gap-2">{g.title}<Badge>{g.items.length}</Badge></span>} description={g.description} />
              <ul className="divide-y divide-slate-100">
                {g.items.map((a) => {
                  const toGrade = a.submissions.filter((s) => !s.gradedAt).length;
                  return (
                    <AssignmentRow
                      key={a.id}
                      href={`/courses/${a.course.id}/assignments/${a.id}`}
                      title={a.title}
                      course={a.course}
                      dueAt={a.dueAt}
                      right={
                        isStudent ? (
                          <AssignmentStatus dueAt={a.dueAt} points={a.points} submission={a.submissions[0]} />
                        ) : toGrade ? (
                          <Badge tone="warning">{toGrade} to grade</Badge>
                        ) : (
                          <span className="text-xs text-slate-500">{a.submissions.length}/{a.course._count.enrollments} in</span>
                        )
                      }
                    />
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
