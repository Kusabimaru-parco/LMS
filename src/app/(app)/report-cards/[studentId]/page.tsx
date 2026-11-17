import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { attendanceSummary, studentGrades, weightsLabel } from "@/lib/grading";
import { logoUrl } from "@/lib/school";
import { PrintButton } from "@/components/print-button";
import { cn, formatDate, letterGrade } from "@/lib/utils";

export const metadata: Metadata = { title: "Report card" };

export default async function ReportCardPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ period?: string }> }) {
  const user = await requireUser(["ADMIN", "STUDENT", "PARENT"]);
  const { studentId } = await params;
  const { period: periodId } = await searchParams;

  const student = await db.user.findFirst({ where: { id: studentId, schoolId: user.schoolId, role: "STUDENT" }, select: { id: true, name: true, gradeLevel: true } });
  if (!student) notFound();
  const allowed =
    user.role === "ADMIN" ||
    (user.role === "STUDENT" && user.id === studentId) ||
    (user.role === "PARENT" && !!(await db.parentLink.findUnique({ where: { parentId_studentId: { parentId: user.id, studentId } } })));
  if (!allowed) notFound();

  const periods = await db.gradingPeriod.findMany({ where: { schoolId: user.schoolId }, orderBy: { startsAt: "asc" } });
  const now = new Date();
  const period = periodId === "all" ? null : periods.find((p) => p.id === periodId) ?? periods.find((p) => p.startsAt <= now && p.endsAt >= now) ?? null;
  const [courses, att] = await Promise.all([
    studentGrades(studentId, { period }),
    attendanceSummary(studentId, { from: period?.startsAt, to: period?.endsAt }),
  ]);
  const graded = courses.filter((c) => c.avg != null);
  const overall = graded.length ? Math.round(graded.reduce((s, c) => s + c.avg!, 0) / graded.length) : null;
  const school = user.school;
  const logo = logoUrl(school);
  const tone = (p: number | null) => (p == null ? "text-slate-400" : p >= 85 ? "text-emerald-700" : p >= 70 ? "text-slate-900" : "text-rose-700");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <nav aria-label="Grading period" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-2">
            {[...periods.map((p) => ({ id: p.id, name: p.name })), { id: "all", name: "Whole year" }].map((p) => {
              const active = (period?.id ?? "all") === p.id;
              return (
                <li key={p.id}>
                  <Link href={`/report-cards/${studentId}?period=${p.id}`} aria-current={active ? "page" : undefined}
                    className={cn("inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                      active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}>
                    {p.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <PrintButton />
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-14 object-contain" />
            ) : (
              <span className="flex size-14 items-center justify-center rounded-xl bg-brand-600 text-white"><GraduationCap className="size-7" aria-hidden /></span>
            )}
            <div>
              <p className="text-lg font-semibold text-slate-900">{school.name}</p>
              {school.address && <p className="text-sm text-slate-600">{school.address}</p>}
              {(school.phone || school.email) && <p className="text-sm text-slate-600">{[school.phone, school.email].filter(Boolean).join(" · ")}</p>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Report card</h1>
            <p className="text-sm text-slate-600">{school.academicYear ?? now.getFullYear()}</p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-4 border-b border-slate-200 py-5 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-500">Student</dt><dd className="font-semibold text-slate-900">{student.name}</dd></div>
          <div><dt className="text-slate-500">Grade level</dt><dd className="font-medium text-slate-900">{student.gradeLevel ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Period</dt><dd className="font-medium text-slate-900">{period ? period.name : "Whole year"}</dd></div>
          <div><dt className="text-slate-500">Dates</dt><dd className="font-medium text-slate-900">{period ? `${formatDate(period.startsAt)} – ${formatDate(period.endsAt)}` : `As of ${formatDate(now)}`}</dd></div>
        </dl>

        <div className="overflow-x-auto py-5">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Grades by course</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-4">Course</th>
                <th scope="col" className="py-2 pr-4">Teacher</th>
                <th scope="col" className="py-2 pr-4 text-right">Average</th>
                <th scope="col" className="py-2 pr-4 text-center">Grade</th>
                <th scope="col" className="py-2 pr-4 text-right">Absent</th>
                <th scope="col" className="py-2 text-right">Late</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.map((c) => {
                const a = att.byCourse.get(c.course.id);
                return (
                  <tr key={c.course.id}>
                    <th scope="row" className="py-3 pr-4 text-left font-medium text-slate-900">
                      {c.course.title}
                      <span className="block text-xs font-normal text-slate-500">{c.course.code} · {weightsLabel(c.weights)}</span>
                    </th>
                    <td className="py-3 pr-4 text-slate-700">{c.course.teacher ?? "—"}</td>
                    <td className={cn("py-3 pr-4 text-right font-semibold", tone(c.avg))}>{c.avg == null ? "—" : `${c.avg}%`}</td>
                    <td className={cn("py-3 pr-4 text-center text-base font-semibold", tone(c.avg))}>{c.letter}</td>
                    <td className="py-3 pr-4 text-right text-slate-700">{a?.ABSENT ?? 0}</td>
                    <td className="py-3 text-right text-slate-700">{a?.LATE ?? 0}</td>
                  </tr>
                );
              })}
              {courses.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Not enrolled in any courses.</td></tr>}
            </tbody>
            {courses.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <th scope="row" colSpan={2} className="py-3 pr-4 text-left font-semibold text-slate-900">Overall</th>
                  <td className={cn("py-3 pr-4 text-right font-semibold", tone(overall))}>{overall == null ? "—" : `${overall}%`}</td>
                  <td className={cn("py-3 pr-4 text-center text-base font-semibold", tone(overall))}>{letterGrade(overall)}</td>
                  <td className="py-3 pr-4 text-right font-medium text-slate-900">{att.all.ABSENT}</td>
                  <td className="py-3 text-right font-medium text-slate-900">{att.all.LATE}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-xs text-slate-500">
          Averages include graded work due in this period. Grades: A 90–100, B 80–89, C 70–79, D 60–69, F below 60.
          Attendance: {att.all.total} recorded days, {att.all.PRESENT} present, {att.all.EXCUSED} excused.
        </p>

        <div className="mt-12 hidden grid-cols-3 gap-8 text-center text-sm text-slate-600 print:grid">
          {["Class adviser", "Principal", "Parent or guardian"].map((r) => (
            <div key={r}><div className="mb-1 border-b border-slate-400 pb-8" />{r}</div>
          ))}
        </div>
      </article>
    </div>
  );
}
