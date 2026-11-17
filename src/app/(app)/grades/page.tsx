import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseScope } from "@/lib/queries";
import { Card, CardHeader, EmptyState, PageHeader, ProgressBar, focusRing } from "@/components/ui";
import { CourseDot } from "@/components/lms";
import { cn, letterGrade, percent } from "@/lib/utils";
import { bestAttempts } from "@/lib/attempts";
import { formatScore, resultsVisible } from "@/lib/quiz";
import { average, courseWeights, weightsLabel, type Category } from "@/lib/grading";

export const metadata: Metadata = { title: "Grades" };


const gradeTone = (p: number | null) =>
  p == null ? "text-slate-400" : p >= 85 ? "text-emerald-700" : p >= 70 ? "text-slate-900" : "text-rose-700";

export default async function GradesPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requireUser(["ADMIN", "TEACHER", "STUDENT"]);
  const { course } = await searchParams;
  return user.role === "STUDENT" ? <StudentGrades user={user} /> : <Gradebook user={user} courseId={course} />;
}

async function StudentGrades({ user }: { user: CurrentUser }) {
  const courses = await db.course.findMany({
    where: courseScope(user),
    orderBy: { title: "asc" },
    include: {
      school: { select: { gradeWeights: true } },
      assignments: {
        orderBy: { dueAt: "asc" },
        include: { submissions: { where: { studentId: user.id }, select: { score: true, gradedAt: true, feedback: true } } },
      },
      quizzes: {
        where: { published: true },
        orderBy: { createdAt: "asc" },
        include: { attempts: { where: { studentId: user.id, submittedAt: { not: null } }, select: { quizId: true, studentId: true, score: true, maxScore: true, submittedAt: true, needsReview: true } } },
      },
    },
  });
  const rows = courses.map((c) => {
    const items = [
      ...c.assignments.map((a) => ({
        id: a.id,
        title: a.title,
        href: `/courses/${c.id}/assignments/${a.id}`,
        points: a.points,
        score: a.submissions[0]?.gradedAt ? a.submissions[0].score : null,
        pending: !!a.submissions[0] && !a.submissions[0].gradedAt,
        at: a.dueAt,
        category: "assignment" as Category,
      })),
      ...c.quizzes.map((q) => {
        const best = bestAttempts(q.attempts).get(`${q.id}:${user.id}`);
        const show = !!best && !best.needsReview && resultsVisible(q).score;
        return {
          id: q.id,
          title: `${q.kind === "EXAM" ? "Exam" : "Quiz"}: ${q.title}`,
          href: `/courses/${c.id}/quizzes/${q.id}`,
          points: best?.maxScore ?? 0,
          score: show ? best!.score : null,
          pending: !!best && !show,
          at: q.closesAt ?? q.createdAt,
          category: (q.kind === "EXAM" ? "exam" : "quiz") as Category,
        };
      }),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    const weights = courseWeights(c.gradeWeights, c.school.gradeWeights);
    return { ...c, items, weights, pct: average(items, weights) };
  });

  return (
    <>
      <PageHeader title="My grades" description="Averages include graded work only." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c) => (
          <a key={c.id} href={`#course-${c.id}`} className={cn("block rounded-xl", focusRing)}>
            <Card className="p-4 hover:shadow-md">
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
                  <CourseDot color={c.color} /><span className="truncate">{c.title}</span>
                </p>
                <span className={cn("text-2xl font-semibold", gradeTone(c.pct))}>{letterGrade(c.pct)}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1"><ProgressBar value={c.pct ?? 0} label={`${c.title} average`} /></div>
                <span className="w-10 text-right text-sm text-slate-600">{c.pct == null ? "—" : `${c.pct}%`}</span>
              </div>
            </Card>
          </a>
        ))}
      </div>

      <div className="space-y-6">
        {rows.map((c) => (
          <Card key={c.id} id={`course-${c.id}`} className="scroll-mt-20">
            <CardHeader title={c.title} description={`${c.pct == null ? "No grades yet" : `Average ${c.pct}% (${letterGrade(c.pct)})`} · ${weightsLabel(c.weights)}`} />
            <ul className="divide-y divide-slate-100">
              {c.items.map((a) => {
                const p = percent(a.score, a.points);
                return (
                  <li key={a.id}>
                    <Link href={a.href} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{a.title}</span>
                      <span className="text-sm text-slate-500">{a.score == null ? (a.pending ? "Pending" : "—") : `${formatScore(a.score)}/${a.points}`}</span>
                      <span className={cn("w-12 text-right text-sm font-semibold", gradeTone(p))}>{p == null ? "" : `${p}%`}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

async function Gradebook({ user, courseId }: { user: CurrentUser; courseId?: string }) {
  const courses = await db.course.findMany({ where: courseScope(user), orderBy: { title: "asc" }, select: { id: true, title: true, color: true, gradeWeights: true, school: { select: { gradeWeights: true } } } });
  if (!courses.length)
    return (
      <>
        <PageHeader title="Gradebook" />
        <Card><EmptyState icon={BarChart3} title="No courses yet">Create a course to start grading.</EmptyState></Card>
      </>
    );
  const selected = courses.find((c) => c.id === courseId) ?? courses[0];
  const [assignments, quizzes, enrolled] = await Promise.all([
    db.assignment.findMany({ where: { courseId: selected.id }, orderBy: { dueAt: "asc" }, include: { submissions: true } }),
    db.quiz.findMany({
      where: { courseId: selected.id, OR: [{ published: true }, { attempts: { some: {} } }] },
      orderBy: { createdAt: "asc" },
      include: { questions: { select: { points: true } }, attempts: { where: { submittedAt: { not: null } }, select: { id: true, quizId: true, studentId: true, score: true, maxScore: true, submittedAt: true, needsReview: true } } },
    }),
    db.enrollment.findMany({ where: { courseId: selected.id }, include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);
  const cell = (aId: string, sId: string) => assignments.find((a) => a.id === aId)?.submissions.find((s) => s.studentId === sId);
  const best = bestAttempts(quizzes.flatMap((q) => q.attempts));
  const weights = courseWeights(selected.gradeWeights, selected.school.gradeWeights);
  const quizPoints = (q: (typeof quizzes)[number]) => q.questions.reduce((n, x) => n + x.points, 0);

  return (
    <>
      <PageHeader title="Gradebook" description={`Scores for every student, assignment, quiz and exam. Averages: ${weightsLabel(weights)}.`} />
      <nav aria-label="Choose course" className="mb-4 no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-2">
          {courses.map((c) => {
            const active = c.id === selected.id;
            return (
              <li key={c.id}>
                <Link
                  href={`/grades?course=${c.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium",
                    focusRing,
                    active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  {!active && <CourseDot color={c.color} />}
                  {c.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${selected.title} gradebook`}>
          <table className="w-full min-w-max border-collapse text-sm">
            <caption className="sr-only">{selected.title} grades by student and assignment</caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Student</th>
                <th scope="col" className="px-4 py-3 text-right">Average</th>
                {assignments.map((a) => (
                  <th key={a.id} scope="col" className="max-w-36 px-4 py-3 text-right font-medium">
                    <Link href={`/courses/${selected.id}/assignments/${a.id}`} className="hover:text-brand-700 hover:underline">
                      <span className="block truncate">{a.title}</span>
                    </Link>
                    <span className="font-normal text-slate-400">/{a.points}</span>
                  </th>
                ))}
                {quizzes.map((q) => (
                  <th key={q.id} scope="col" className="max-w-36 px-4 py-3 text-right font-medium">
                    <Link href={`/courses/${selected.id}/quizzes/${q.id}`} className="hover:text-brand-700 hover:underline">
                      <span className="block truncate">{q.title}</span>
                    </Link>
                    <span className="font-normal text-slate-400">{q.kind === "EXAM" ? "Exam" : "Quiz"} /{quizPoints(q)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrolled.map(({ user: s }) => {
                const p = average([
                  ...assignments.map((a) => ({ category: "assignment" as Category, score: cell(a.id, s.id)?.gradedAt ? cell(a.id, s.id)!.score : null, points: a.points })),
                  ...quizzes.map((q) => {
                    const b = best.get(`${q.id}:${s.id}`);
                    return { category: (q.kind === "EXAM" ? "exam" : "quiz") as Category, score: b && !b.needsReview ? b.score : null, points: b?.maxScore ?? quizPoints(q) };
                  }),
                ], weights);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-medium text-slate-900">{s.name}</th>
                    <td className={cn("px-4 py-3 text-right font-semibold", gradeTone(p))}>{p == null ? "—" : `${p}%`}</td>
                    {assignments.map((a) => {
                      const sub = cell(a.id, s.id);
                      return (
                        <td key={a.id} className="px-4 py-3 text-right">
                          <Link href={`/courses/${selected.id}/assignments/${a.id}?student=${s.id}#grade`} className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                            {sub?.gradedAt ? (
                              <span className="text-slate-900">{sub.score}</span>
                            ) : sub ? (
                              <span className="font-medium text-amber-700">Grade</span>
                            ) : a.dueAt < new Date() ? (
                              <span className="text-rose-600">Missing</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </Link>
                        </td>
                      );
                    })}
                    {quizzes.map((q) => {
                      const b = best.get(`${q.id}:${s.id}`);
                      const closed = !!q.closesAt && q.closesAt < new Date();
                      return (
                        <td key={q.id} className="px-4 py-3 text-right">
                          {b ? (
                            <Link href={`/courses/${selected.id}/quizzes/${q.id}/attempts/${b.id}`} className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                              {b.needsReview ? <span className="font-medium text-amber-700">Review</span> : <span className="text-slate-900">{formatScore(b.score)}</span>}
                            </Link>
                          ) : closed ? <span className="text-rose-600">Missing</span> : <span className="text-slate-400">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
