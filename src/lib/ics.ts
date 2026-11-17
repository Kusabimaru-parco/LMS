// Personal calendar feed (iCalendar / .ics) for Google Calendar, Outlook and Apple Calendar.
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { courseScope } from "./queries";

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const day = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds lines longer than 75 octets, as the iCalendar spec requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

type Ev = { uid: string; title: string; start: Date; end?: Date | null; allDay?: boolean; description?: string; url?: string; location?: string };

export async function buildCalendar(user: CurrentUser, baseUrl: string) {
  const from = new Date(Date.now() - 30 * 86_400_000);
  const to = new Date(Date.now() + 365 * 86_400_000);
  const scope = courseScope(user);
  const [assignments, quizzes, events] = await Promise.all([
    db.assignment.findMany({ where: { course: scope, dueAt: { gte: from, lte: to } }, include: { course: { select: { id: true, title: true } } } }),
    db.quiz.findMany({ where: { course: scope, published: true, closesAt: { gte: from, lte: to } }, include: { course: { select: { id: true, title: true } } } }),
    db.event.findMany({ where: { schoolId: user.schoolId, startsAt: { gte: from, lte: to }, OR: [{ courseId: null }, { course: scope }] }, include: { course: { select: { title: true } } } }),
  ]);
  const evs: Ev[] = [
    ...assignments.map((a) => ({ uid: `a-${a.id}`, title: `Due: ${a.title} (${a.course.title})`, start: a.dueAt, url: `${baseUrl}/courses/${a.course.id}/assignments/${a.id}` })),
    ...quizzes.map((q) => ({
      uid: `q-${q.id}`,
      title: `${q.kind === "EXAM" ? "Exam" : "Quiz"}: ${q.title} (${q.course.title})`,
      start: q.opensAt && q.kind === "EXAM" ? q.opensAt : q.closesAt!,
      end: q.opensAt && q.kind === "EXAM" ? q.closesAt : null,
      url: `${baseUrl}/courses/${q.course.id}/quizzes/${q.id}`,
    })),
    ...events.map((e) => ({
      uid: `e-${e.id}`, title: e.course ? `${e.title} (${e.course.title})` : e.title, start: e.startsAt, end: e.endsAt, allDay: e.allDay,
      description: e.description, location: e.location,
    })),
  ];

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Campus LMS//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(user.school.name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT2H"];
  const now = stamp(new Date());
  for (const e of evs) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@campus-lms`, `DTSTAMP:${now}`);
    if (e.allDay) {
      const next = new Date(e.start);
      next.setDate(next.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${day(e.start)}`, `DTEND;VALUE=DATE:${day(e.end && e.end > e.start ? e.end : next)}`);
    } else {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end && e.end > e.start ? e.end : new Date(e.start.getTime() + 30 * 60_000))}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
