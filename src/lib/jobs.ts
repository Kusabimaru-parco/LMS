// Background jobs: "due tomorrow" reminders and the weekly parent summary.
// Run every 15 minutes by the server itself (see instrumentation.ts) or by an external cron
// calling /api/cron. Every email is logged in JobLog first, so nothing is ever sent twice.
import { db } from "./db";
import { isEmailConfigured } from "./email";
import { sendTemplated } from "./notifications";
import { getBaseUrl } from "./url";
import { attendanceSummary, studentGrades } from "./grading";
import { formatDue } from "./utils";

/** Releases a claim after a failed send, so the next run tries again. */
const release = (key: string) => db.jobLog.delete({ where: { key } }).catch(() => {});

/** Claims a job key. Returns false if it was already done (unique primary key). */
async function claim(key: string) {
  try {
    await db.jobLog.create({ data: { key } });
    return true;
  } catch {
    return false;
  }
}

export async function sendDueReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3_600_000);
  const base = await getBaseUrl();
  let sent = 0;

  const assignments = await db.assignment.findMany({
    where: { dueAt: { gt: now, lte: soon } },
    include: {
      course: {
        select: {
          id: true, title: true, school: { select: { name: true, brandColor: true } },
          enrollments: { where: { user: { emailReminders: true } }, select: { user: { select: { id: true, name: true, email: true, role: true } } } },
        },
      },
      submissions: { select: { studentId: true } },
    },
  });
  for (const a of assignments) {
    const done = new Set(a.submissions.map((s) => s.studentId));
    for (const { user } of a.course.enrollments) {
      const key = `remind:a:${a.id}:${user.id}`;
      if (done.has(user.id) || !(await claim(key))) continue;
      const r = await sendTemplated("dueReminder", user, a.course.school, {
        kind: "assignment", title: a.title, course: a.course.title, due: formatDue(a.dueAt), link: `${base}/courses/${a.course.id}/assignments/${a.id}`,
      });
      if (r.ok) sent++;
      else await release(key);
    }
  }

  const quizzes = await db.quiz.findMany({
    where: { published: true, closesAt: { gt: now, lte: soon } },
    include: {
      course: {
        select: {
          id: true, title: true, school: { select: { name: true, brandColor: true } },
          enrollments: { where: { user: { emailReminders: true } }, select: { user: { select: { id: true, name: true, email: true, role: true } } } },
        },
      },
      attempts: { where: { submittedAt: { not: null } }, select: { studentId: true } },
    },
  });
  for (const q of quizzes) {
    const done = new Set(q.attempts.map((a) => a.studentId));
    for (const { user } of q.course.enrollments) {
      const key = `remind:q:${q.id}:${user.id}`;
      if (done.has(user.id) || !(await claim(key))) continue;
      const r = await sendTemplated("dueReminder", user, q.course.school, {
        kind: q.kind === "EXAM" ? "exam" : "quiz", title: q.title, course: q.course.title, due: formatDue(q.closesAt!), link: `${base}/courses/${q.course.id}/quizzes/${q.id}`,
      });
      if (r.ok) sent++;
      else await release(key);
    }
  }
  return sent;
}

function weekKey(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)}`;
}

/** The text summary for one child, used in the weekly email. */
export async function childSummary(studentId: string, name: string) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const [courses, att] = await Promise.all([studentGrades(studentId), attendanceSummary(studentId, { from: weekAgo, to: now })]);
  const graded = courses.filter((c) => c.avg != null);
  const overall = graded.length ? Math.round(graded.reduce((s, c) => s + c.avg!, 0) / graded.length) : null;
  const missing = courses.flatMap((c) => c.missing.map((m) => `${m.title} (${c.course.title})`));
  const due = courses.flatMap((c) => c.items.filter((i) => !i.submitted && i.due >= now && i.due <= weekAhead).map((i) => `${i.title} (${c.course.title})`));
  return [
    name,
    `- Average: ${overall == null ? "no grades yet" : `${overall}%`}`,
    ...graded.map((c) => `- ${c.course.title}: ${c.avg}% (${c.letter})`),
    `- Missing work: ${missing.length ? missing.slice(0, 5).join(", ") + (missing.length > 5 ? ` and ${missing.length - 5} more` : "") : "none"}`,
    `- Due this week: ${due.length ? due.slice(0, 5).join(", ") : "nothing"}`,
    `- Absences in the last 7 days: ${att.all.ABSENT}${att.all.LATE ? ` (late ${att.all.LATE}×)` : ""}`,
  ].join("\n");
}

/** Mondays from 7 AM (server time): one summary per parent per week. */
export async function sendParentDigests(force = false) {
  const now = new Date();
  if (!force && (now.getDay() !== 1 || now.getHours() < 7)) return 0;
  const key = weekKey(now);
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const week = `${fmt.format(start)} – ${fmt.format(end)}`;
  const base = await getBaseUrl();

  const parents = await db.user.findMany({
    where: { role: "PARENT", emailReminders: true, children: { some: {} } },
    select: { id: true, name: true, email: true, role: true, school: { select: { name: true, brandColor: true } }, children: { select: { student: { select: { id: true, name: true } } } } },
  });
  let sent = 0;
  for (const p of parents) {
    const jobKey = `digest:${p.id}:${key}`;
    if (!(await claim(jobKey))) continue;
    const parts = await Promise.all(p.children.map((c) => childSummary(c.student.id, c.student.name)));
    const r = await sendTemplated("parentDigest", p, p.school, { summary: parts.join("\n\n"), week, link: `${base}/dashboard` });
    if (r.ok) sent++;
    else await release(jobKey);
  }
  return sent;
}

let running = false;
export async function runJobs() {
  if (running || !(await isEmailConfigured())) return { reminders: 0, digests: 0, skipped: true };
  running = true;
  try {
    const reminders = await sendDueReminders();
    const digests = await sendParentDigests();
    // Keep the log small: entries older than 60 days can't match anything any more.
    await db.jobLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * 86_400_000) } } });
    return { reminders, digests, skipped: false };
  } finally {
    running = false;
  }
}
