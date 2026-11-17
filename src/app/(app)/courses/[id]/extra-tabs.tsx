// Course tabs added later: Attendance and Settings.
import { CalendarCheck2 } from "lucide-react";
import { db } from "@/lib/db";
import { courseWeights, parseWeights, weightsLabel, ATTENDANCE } from "@/lib/grading";
import { saveAttendance, updateCourse, updateCourseWeights } from "@/app/actions";
import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { AttendanceForm } from "@/components/attendance-form";
import { SimpleForm } from "@/components/simple-form";
import { WeightsForm } from "@/components/weights-form";
import { avatarUrl, COURSE_COLORS, formatDate } from "@/lib/utils";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function AttendanceTab({ courseId, canManage, userId, date }: { courseId: string; canManage: boolean; userId: string; date?: string }) {
  if (!canManage) {
    const rows = await db.attendance.findMany({ where: { courseId, studentId: userId }, orderBy: { date: "desc" }, take: 60 });
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          {ATTENDANCE.map((a) => <Stat key={a.id} label={a.label} value={count(a.id)} icon={CalendarCheck2} />)}
        </div>
        <Card>
          <CardHeader title="Your attendance" description="The most recent days your teacher took attendance." />
          {rows.length ? (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => {
                const a = ATTENDANCE.find((x) => x.id === r.status)!;
                return (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex-1 text-sm text-slate-900">{formatDate(new Date(`${isoDay(r.date)}T12:00:00`))}</span>
                    {r.note && <span className="hidden text-sm text-slate-500 sm:inline">{r.note}</span>}
                    <Badge tone={a.tone}>{a.label}</Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={CalendarCheck2} title="No attendance yet">Your teacher hasn't taken attendance in this class.</EmptyState>
          )}
        </Card>
      </div>
    );
  }

  const today = localToday();
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;
  const [enrolled, records, history] = await Promise.all([
    db.enrollment.findMany({ where: { courseId }, include: { user: { select: { id: true, name: true, avatarUpdatedAt: true } } }, orderBy: { user: { name: "asc" } } }),
    db.attendance.findMany({ where: { courseId, date: new Date(`${day}T00:00:00.000Z`) } }),
    db.attendance.groupBy({ by: ["studentId", "status"], where: { courseId }, _count: true }),
  ]);
  if (!enrolled.length) {
    return <Card><EmptyState icon={CalendarCheck2} title="No students yet">Attendance appears here once students join the class.</EmptyState></Card>;
  }
  const summary = (id: string) => {
    const mine = history.filter((h) => h.studentId === id);
    const n = (s: string) => mine.find((m) => m.status === s)?._count ?? 0;
    const total = mine.reduce((t, m) => t + m._count, 0);
    return total ? `This year: ${n("ABSENT")} absent · ${n("LATE")} late · ${total} days` : "No attendance yet";
  };
  return (
    <AttendanceForm
      key={day}
      action={saveAttendance.bind(null, courseId)}
      date={day}
      today={today}
      courseId={courseId}
      students={enrolled.map(({ user: u }) => {
        const r = records.find((x) => x.studentId === u.id);
        return { id: u.id, name: u.name, avatar: avatarUrl(u), status: r?.status ?? null, note: r?.note ?? "", summary: summary(u.id) };
      })}
    />
  );
}

export async function SettingsTab({ course, schoolWeights }: {
  course: { id: string; title: string; code: string; description: string; color: string; gradeWeights: unknown };
  schoolWeights: unknown;
}) {
  const own = course.gradeWeights;
  const mode = own == null ? "inherit" : parseWeights(own) ? "weighted" : "points";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader title="Course details" />
        <div className="p-5">
          <SimpleForm
            action={updateCourse.bind(null, course.id)}
            submitLabel="Save details"
            fields={[
              { name: "title", label: "Course title", required: true, defaultValue: course.title },
              { name: "code", label: "Course code", required: true, defaultValue: course.code, half: true },
              { name: "color", label: "Colour", type: "select", defaultValue: course.color, half: true, options: Object.keys(COURSE_COLORS).map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })) },
              { name: "description", label: "Description", type: "textarea", rows: 3, defaultValue: course.description },
            ]}
          />
        </div>
      </Card>
      <Card className="min-w-0">
        <CardHeader title="Grading" description={`Now: ${weightsLabel(courseWeights(own, schoolWeights))}`} />
        <div className="p-5">
          <WeightsForm
            action={updateCourseWeights.bind(null, course.id)}
            initial={parseWeights(own) as Record<string, number> | null}
            initialMode={mode}
            inherit
            schoolLabel={weightsLabel(parseWeights(schoolWeights))}
          />
        </div>
      </Card>
    </div>
  );
}
