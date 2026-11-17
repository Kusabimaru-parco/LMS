import Link from "next/link";
import { AlertCircle, CalendarCheck2, CalendarClock, FileBadge, TrendingUp, Users } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { attendanceSummary, studentGrades } from "@/lib/grading";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, ProgressBar, Stat, focusRing } from "@/components/ui";
import { CourseDot } from "@/components/lms";
import { avatarUrl, cn, formatDue, letterGrade, timeAgo } from "@/lib/utils";

export async function ParentDashboard({ user, childId }: { user: CurrentUser; childId?: string }) {
  const links = await db.parentLink.findMany({
    where: { parentId: user.id },
    include: { student: { select: { id: true, name: true, gradeLevel: true, avatarUpdatedAt: true } } },
    orderBy: { student: { name: "asc" } },
  });
  if (!links.length) {
    return (
      <Card>
        <EmptyState icon={Users} title="No children linked yet">
          Your account isn't connected to a student yet. Ask the school office to link your child using their school email.
        </EmptyState>
      </Card>
    );
  }
  const child = (links.find((l) => l.student.id === childId) ?? links[0]).student;
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const [courses, att, announcements] = await Promise.all([
    studentGrades(child.id),
    attendanceSummary(child.id, { from: new Date(now.getTime() - 30 * 86_400_000) }),
    db.announcement.findMany({
      where: { course: { enrollments: { some: { userId: child.id } } } },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { course: { select: { title: true, color: true } } },
    }),
  ]);
  const graded = courses.filter((c) => c.avg != null);
  const overall = graded.length ? Math.round(graded.reduce((s, c) => s + c.avg!, 0) / graded.length) : null;
  const all = courses.flatMap((c) => c.items.map((i) => ({ ...i, course: c.course })));
  const missing = all.filter((i) => i.missing);
  const upcoming = all.filter((i) => !i.submitted && i.due >= now && i.due <= weekAhead).sort((a, b) => a.due.getTime() - b.due.getTime());
  const recent = all.filter((i) => i.score != null).sort((a, b) => b.due.getTime() - a.due.getTime()).slice(0, 6);

  return (
    <div className="space-y-6">
      {links.length > 1 && (
        <nav aria-label="Choose a child" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-2">
            {links.map(({ student: s }) => (
              <li key={s.id}>
                <Link href={`/dashboard?child=${s.id}`} aria-current={s.id === child.id ? "page" : undefined}
                  className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-sm font-medium", focusRing,
                    s.id === child.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}>
                  <Avatar name={s.name} size="sm" src={avatarUrl(s)} />{s.name.split(" ")[0]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar name={child.name} size="lg" src={avatarUrl(child)} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-slate-900">{child.name}</p>
          <p className="text-sm text-slate-600">{child.gradeLevel ?? "Student"} · {courses.length} course{courses.length === 1 ? "" : "s"}</p>
        </div>
        <ButtonLink href={`/report-cards/${child.id}`} variant="secondary"><FileBadge className="size-4" aria-hidden />Report card</ButtonLink>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*]:min-w-0">
        <Stat label="Average" value={overall == null ? "—" : `${overall}%`} icon={TrendingUp} hint={overall == null ? "No grades yet" : `Grade ${letterGrade(overall)}`} />
        <Stat label="Missing work" value={missing.length} icon={AlertCircle} hint={missing.length ? "Listed below" : "Nothing missing"} />
        <Stat label="Due this week" value={upcoming.length} icon={CalendarClock} />
        <Stat label="Absences" value={att.all.ABSENT} icon={CalendarCheck2} hint={`Last 30 days${att.all.LATE ? ` · late ${att.all.LATE}×` : ""}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Courses" />
            <ul className="divide-y divide-slate-100">
              {courses.map((c) => (
                <li key={c.course.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-900"><CourseDot color={c.course.color} />{c.course.title}</span>
                    <span className="block pl-[18px] text-xs text-slate-500">{c.course.teacher ?? "No teacher"}{c.missing.length ? ` · ${c.missing.length} missing` : ""}</span>
                  </span>
                  <span className="hidden w-32 sm:block"><ProgressBar value={c.avg ?? 0} label={`${c.course.title} average`} /></span>
                  <span className={cn("w-16 text-right text-sm font-semibold", c.avg == null ? "text-slate-400" : c.avg >= 85 ? "text-emerald-700" : c.avg >= 70 ? "text-slate-900" : "text-rose-700")}>
                    {c.avg == null ? "—" : `${c.avg}% ${c.letter}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Missing and coming up" />
            {missing.length + upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="All caught up">Nothing missing and nothing due in the next 7 days.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...missing, ...upcoming].map((i) => (
                  <li key={`${i.kind}-${i.id}`} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{i.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500"><CourseDot color={i.course.color} />{i.course.title} · due {formatDue(i.due)}</span>
                    </span>
                    {i.missing ? <Badge tone="danger" icon={AlertCircle}>Missing</Badge> : <Badge tone="warning">Due soon</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Recent grades" />
            {recent.length ? (
              <ul className="divide-y divide-slate-100">
                {recent.map((i) => (
                  <li key={`${i.kind}-${i.id}`} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900">{i.title}</span>
                      <span className="block truncate text-xs text-slate-500">{i.course.title}</span>
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{Math.round(((i.score ?? 0) / (i.points || 1)) * 100)}%</span>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-4 text-sm text-slate-500">No grades yet.</p>}
          </Card>
          <Card>
            <CardHeader title="Announcements" />
            {announcements.length ? (
              <ul className="divide-y divide-slate-100">
                {announcements.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><CourseDot color={a.course.color} />{a.course.title} · {timeAgo(a.createdAt)}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{a.title}</p>
                    <p className="mt-0.5 line-clamp-3 text-sm text-slate-600">{a.body}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-4 text-sm text-slate-500">No announcements.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
