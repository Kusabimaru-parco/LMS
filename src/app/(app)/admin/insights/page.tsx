import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, BookOpen, UserX } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, ProgressBar, Stat } from "@/components/ui";
import { CourseDot } from "@/components/lms";
import { avatarUrl, cn, ROLE_LABEL, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Insights" };

const DAY = 86_400_000;

export default async function InsightsPage() {
  const admin = await requireUser(["ADMIN"]);
  const s = admin.schoolId;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);

  const [users, courses, pastDue, enrollments, absences] = await Promise.all([
    db.user.findMany({ where: { schoolId: s }, select: { id: true, name: true, email: true, role: true, gradeLevel: true, lastSeenAt: true, lastLoginAt: true, createdAt: true, avatarUpdatedAt: true } }),
    db.course.findMany({
      where: { schoolId: s },
      select: {
        id: true, title: true, color: true, teacher: { select: { name: true } }, _count: { select: { enrollments: true } },
        lessons: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        assignments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        announcements: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    db.assignment.findMany({
      where: { course: { schoolId: s }, dueAt: { lt: now } },
      select: { id: true, courseId: true, points: true, submissions: { select: { studentId: true, score: true, gradedAt: true } } },
    }),
    db.enrollment.findMany({ where: { course: { schoolId: s } }, select: { userId: true, courseId: true } }),
    db.attendance.groupBy({ by: ["studentId"], where: { status: "ABSENT", date: { gte: monthAgo }, course: { schoolId: s } }, _count: true }),
  ]);

  const active = (u: (typeof users)[number]) => (u.lastSeenAt ?? u.lastLoginAt ?? new Date(0)) >= weekAgo;
  const byRole = (role: string) => users.filter((u) => u.role === role);
  const neverSignedIn = users.filter((u) => !u.lastLoginAt && !u.lastSeenAt);

  // Per course: submission rate on past-due work
  const courseStats = courses.map((c) => {
    const due = pastDue.filter((a) => a.courseId === c.id);
    const expected = due.length * c._count.enrollments;
    const handedIn = due.reduce((n, a) => n + a.submissions.length, 0);
    const graded = due.flatMap((a) => a.submissions.filter((x) => x.gradedAt).map((x) => ({ score: x.score ?? 0, points: a.points })));
    const avg = graded.length ? Math.round((graded.reduce((n, g) => n + g.score, 0) / graded.reduce((n, g) => n + g.points, 0)) * 100) : null;
    const last = [c.lessons[0]?.createdAt, c.assignments[0]?.createdAt, c.announcements[0]?.createdAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
    return { ...c, rate: expected ? Math.round((handedIn / expected) * 100) : null, avg, last };
  }).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));

  // Per student: missing work, average, absences
  const absentBy = new Map(absences.map((a) => [a.studentId, a._count]));
  const coursesOf = new Map<string, string[]>();
  for (const e of enrollments) coursesOf.set(e.userId, [...(coursesOf.get(e.userId) ?? []), e.courseId]);
  const atRisk = byRole("STUDENT").map((st) => {
    const mine = new Set(coursesOf.get(st.id) ?? []);
    const due = pastDue.filter((a) => mine.has(a.courseId));
    const subs = due.map((a) => ({ a, sub: a.submissions.find((x) => x.studentId === st.id) }));
    const missing = subs.filter((x) => !x.sub).length;
    const graded = subs.filter((x) => x.sub?.gradedAt);
    const avg = graded.length ? Math.round((graded.reduce((n, x) => n + (x.sub!.score ?? 0), 0) / graded.reduce((n, x) => n + x.a.points, 0)) * 100) : null;
    const absent = absentBy.get(st.id) ?? 0;
    const reasons = [
      ...(missing >= 3 ? [`${missing} missing`] : []),
      ...(avg != null && avg < 70 ? [`Average ${avg}%`] : []),
      ...(absent >= 3 ? [`${absent} absences (30 days)`] : []),
      ...(!active(st) && st.lastLoginAt ? ["Not active this week"] : []),
    ];
    return { ...st, missing, avg, absent, reasons, score: missing * 2 + (avg != null && avg < 70 ? (70 - avg) / 5 : 0) + absent * 2 };
  }).filter((x) => x.reasons.length).sort((a, b) => b.score - a.score);

  const roles = ["STUDENT", "TEACHER", "PARENT"] as const;

  return (
    <>
      <PageHeader title="Insights" description="Who is using the LMS, which classes are falling behind, and which students may need help." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*]:min-w-0">
        <Stat label="Active this week" value={`${users.filter(active).length}/${users.length}`} icon={Activity} hint="Used the LMS in the last 7 days" />
        <Stat label="Never signed in" value={neverSignedIn.length} icon={UserX} hint={neverSignedIn.length ? "Listed below" : "Everyone has started"} />
        <Stat label="Students to check on" value={atRisk.length} icon={AlertTriangle} hint="Missing work, low grades or absences" />
        <Stat label="Courses" value={courses.length} icon={BookOpen} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title="Students who may need help" description="3+ missing assignments, an average under 70%, or 3+ absences in 30 days." />
          {atRisk.length ? (
            <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              {atRisk.slice(0, 50).map((st) => (
                <li key={st.id}>
                  <Link href={`/admin/users/${st.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                    <Avatar name={st.name} size="sm" src={avatarUrl(st)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{st.name}</span>
                      <span className="block truncate text-xs text-slate-500">{st.gradeLevel ?? st.email}</span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">{st.reasons.map((r) => <Badge key={r} tone={r.includes("missing") || r.includes("Average") ? "danger" : "warning"}>{r}</Badge>)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={AlertTriangle} title="No one stands out">Every student is handing in work and attending.</EmptyState>
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Using the LMS" description="Active in the last 7 days" />
          <ul className="space-y-4 p-5">
            {roles.map((r) => {
              const list = byRole(r);
              const pct = list.length ? Math.round((list.filter(active).length / list.length) * 100) : 0;
              return (
                <li key={r}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-800">{ROLE_LABEL[r]}s</span><span className="text-slate-600">{list.filter(active).length} of {list.length}</span></div>
                  <ProgressBar value={pct} label={`${ROLE_LABEL[r]}s active this week`} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Classes" description="Lowest hand-in rate first. Based on assignments that are already due." />
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Class statistics">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr><th className="px-5 py-2.5">Course</th><th className="px-4 py-2.5">Students</th><th className="px-4 py-2.5">Handed in</th><th className="px-4 py-2.5">Average</th><th className="px-4 py-2.5">Last new content</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courseStats.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3"><Link href={`/courses/${c.id}`} className="flex items-center gap-2 font-medium text-slate-900 hover:text-brand-700 hover:underline"><CourseDot color={c.color} />{c.title}</Link><span className="block pl-[18px] text-xs text-slate-500">{c.teacher?.name ?? "No teacher"}</span></td>
                  <td className="px-4 py-3 text-slate-700">{c._count.enrollments}</td>
                  <td className={cn("px-4 py-3 font-medium", c.rate == null ? "text-slate-400" : c.rate < 70 ? "text-rose-700" : c.rate < 85 ? "text-amber-700" : "text-emerald-700")}>{c.rate == null ? "—" : `${c.rate}%`}</td>
                  <td className="px-4 py-3 text-slate-700">{c.avg == null ? "—" : `${c.avg}%`}</td>
                  <td className={cn("px-4 py-3", c.last && now.getTime() - c.last.getTime() > 14 * DAY ? "text-amber-700" : "text-slate-600")}>{c.last ? timeAgo(c.last) : "Nothing yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {neverSignedIn.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Haven't signed in yet" description="Check they received their welcome email, or reset their password from their profile." />
          <ul className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
            {neverSignedIn.slice(0, 40).map((u) => (
              <li key={u.id} className="sm:border-b sm:border-slate-100">
                <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Avatar name={u.name} size="sm" src={avatarUrl(u)} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{u.name}</span><span className="block truncate text-xs text-slate-500">{ROLE_LABEL[u.role]} · added {timeAgo(u.createdAt)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
          {neverSignedIn.length > 40 && <p className="px-5 py-3 text-sm text-slate-500">And {neverSignedIn.length - 40} more.</p>}
        </Card>
      )}
    </>
  );
}
