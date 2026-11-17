import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, MapPin, PartyPopper, Timer, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseScope } from "@/lib/queries";
import { createEvent, deleteEvent } from "@/app/actions";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, focusRing } from "@/components/ui";
import { CourseDot } from "@/components/lms";
import { SimpleForm } from "@/components/simple-form";
import { ConfirmButton } from "@/components/confirm-button";
import { cn, courseColor, toLocalInput } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar" };

type Kind = "assignment" | "quiz" | "exam" | "opens" | "event";
type Item = {
  key: string;
  kind: Kind;
  title: string;
  at: Date;
  end?: Date | null;
  allDay?: boolean;
  href?: string;
  course?: { title: string; color: string } | null;
  location?: string;
  description?: string;
  deleteId?: string;
  done?: boolean;
};

const KIND: Record<Kind, { label: string; icon: typeof ClipboardList }> = {
  assignment: { label: "Due", icon: ClipboardList },
  quiz: { label: "Quiz closes", icon: Timer },
  exam: { label: "Exam", icon: ClipboardCheck },
  opens: { label: "Opens", icon: Timer },
  event: { label: "Event", icon: PartyPopper },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const time = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
const monthLabel = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(d);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const user = await requireUser();
  const { month, view = "month" } = await searchParams;
  const now = new Date();
  const [y, m] = /^\d{4}-\d{2}$/.test(month ?? "") ? month!.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0, 23, 59, 59, 999);
  const gridStart = new Date(y, m - 1, 1 - first.getDay());
  const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 41, 23, 59, 59, 999);
  const isStudent = user.role === "STUDENT";
  const scope = courseScope(user);
  const range = { gte: gridStart, lte: gridEnd };

  const [assignments, quizzes, events, myCourses] = await Promise.all([
    db.assignment.findMany({
      where: { course: scope, dueAt: range },
      include: { course: { select: { id: true, title: true, color: true } }, submissions: { where: { studentId: user.id }, select: { id: true } } },
    }),
    db.quiz.findMany({
      where: { course: scope, ...(isStudent ? { published: true } : {}), OR: [{ closesAt: range }, { opensAt: range }] },
      include: { course: { select: { id: true, title: true, color: true } }, attempts: { where: { studentId: user.id, submittedAt: { not: null } }, select: { id: true } } },
    }),
    db.event.findMany({
      where: { schoolId: user.schoolId, startsAt: { lte: gridEnd }, OR: [{ courseId: null }, { course: scope }], AND: [{ OR: [{ endsAt: { gte: gridStart } }, { startsAt: { gte: gridStart } }] }] },
      include: { course: { select: { title: true, color: true, teacherId: true } } },
    }),
    user.role === "STUDENT" ? Promise.resolve([]) : db.course.findMany({ where: scope, orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);

  const items: Item[] = [
    ...assignments.map((a): Item => ({
      key: `a-${a.id}`, kind: "assignment", title: a.title, at: a.dueAt, course: a.course, href: `/courses/${a.course.id}/assignments/${a.id}`, done: isStudent && a.submissions.length > 0,
    })),
    ...quizzes.flatMap((q): Item[] => {
      const out: Item[] = [];
      const href = `/courses/${q.course.id}/quizzes/${q.id}`;
      const name = `${q.kind === "EXAM" ? "Exam" : "Quiz"}: ${q.title}${q.published ? "" : " (draft)"}`;
      if (q.opensAt && q.opensAt >= gridStart && q.opensAt <= gridEnd) out.push({ key: `qo-${q.id}`, kind: q.kind === "EXAM" ? "exam" : "opens", title: `${name} opens`, at: q.opensAt, course: q.course, href });
      if (q.closesAt && q.closesAt >= gridStart && q.closesAt <= gridEnd)
        out.push({ key: `qc-${q.id}`, kind: q.kind === "EXAM" ? "exam" : "quiz", title: q.opensAt && q.kind === "EXAM" ? `${name} closes` : name, at: q.closesAt, course: q.course, href, done: isStudent && q.attempts.length > 0 });
      return out;
    }),
    ...events.map((e): Item => ({
      key: `e-${e.id}`, kind: "event", title: e.title, at: e.startsAt, end: e.endsAt, allDay: e.allDay, course: e.course, location: e.location, description: e.description,
      deleteId: user.role === "ADMIN" || (user.role === "TEACHER" && e.course?.teacherId === user.id) ? e.id : undefined,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const byDay = new Map<string, Item[]>();
  for (const it of items) {
    // Multi-day events appear on each day they cover.
    const endDay = it.end && it.end > it.at ? it.end : it.at;
    for (let d = new Date(it.at.getFullYear(), it.at.getMonth(), it.at.getDate()); d <= endDay && d <= gridEnd; d.setDate(d.getDate() + 1)) {
      if (d < gridStart) continue;
      const k = dayKey(d);
      byDay.set(k, [...(byDay.get(k) ?? []), it]);
    }
  }
  const monthDays = [...byDay.entries()].filter(([k]) => k.startsWith(`${y}-${String(m).padStart(2, "0")}`)).sort(([a], [b]) => a.localeCompare(b));
  const prev = `${new Date(y, m - 2, 1).getFullYear()}-${String(new Date(y, m - 2, 1).getMonth() + 1).padStart(2, "0")}`;
  const next = `${new Date(y, m, 1).getFullYear()}-${String(new Date(y, m, 1).getMonth() + 1).padStart(2, "0")}`;
  const todayKey = dayKey(now);
  const qs = (mo: string, v = view) => `/calendar?month=${mo}&view=${v}`;
  const cur = `${y}-${String(m).padStart(2, "0")}`;
  const canAdd = user.role !== "STUDENT" && (user.role === "ADMIN" || myCourses.length > 0);
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);

  const navBtn = cn("flex size-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50", focusRing);

  return (
    <>
      <PageHeader title="Calendar" description={isStudent ? "Due dates, quizzes, exams and class events." : user.role === "PARENT" ? "Your children's due dates, exams and school events." : "Due dates, quizzes, exams and events for your classes."}
        actions={<ButtonLink href="/account#calendar" variant="secondary"><CalendarDays className="size-4" aria-hidden />Add to my calendar app</ButtonLink>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={qs(prev)} className={navBtn} aria-label="Previous month"><ChevronLeft className="size-5" aria-hidden /></Link>
        <Link href={qs(next)} className={navBtn} aria-label="Next month"><ChevronRight className="size-5" aria-hidden /></Link>
        <h2 className="ml-1 text-lg font-semibold text-slate-900" aria-live="polite">{monthLabel(first)}</h2>
        {cur !== dayKey(now).slice(0, 7) && <ButtonLink href={qs(dayKey(now).slice(0, 7))} variant="ghost">Today</ButtonLink>}
        <div className="ml-auto hidden rounded-lg border border-slate-300 bg-white p-0.5 md:flex" role="group" aria-label="View">
          {[["month", "Month"], ["list", "List"]].map(([v, l]) => (
            <Link key={v} href={qs(cur, v)} aria-current={view === v ? "page" : undefined}
              className={cn("inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium", focusRing, view === v ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100")}>{l}</Link>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-6", canAdd && "xl:grid-cols-[1fr_20rem]")}>
        <div className="min-w-0 space-y-6">
          {view === "month" && (
            <Card className="hidden overflow-hidden md:block">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-600" aria-hidden>
                {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
              </div>
              <ol className="grid grid-cols-7">
                {Array.from({ length: 42 }, (_, i) => {
                  const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
                  const k = dayKey(d);
                  const list = byDay.get(k) ?? [];
                  const inMonth = d.getMonth() === m - 1;
                  return (
                    <li key={k} className={cn("min-h-28 border-b border-r border-slate-100 p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-slate-50/70")}>
                      <span className={cn("mb-1 flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                        k === todayKey ? "bg-brand-600 text-white" : inMonth ? "text-slate-800" : "text-slate-400")}>
                        <span className="sr-only">{dayLabel(d)}</span><span aria-hidden>{d.getDate()}</span>
                      </span>
                      <ul className="space-y-1">
                        {list.slice(0, 3).map((it) => (
                          <li key={it.key}>
                            <Link href={it.href ?? `#day-${k}`} title={`${it.title}${it.course ? ` · ${it.course.title}` : ""}`}
                              className={cn("flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-5", focusRing,
                                it.kind === "event" ? "bg-violet-50 text-violet-800" : it.kind === "exam" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-800",
                                it.done && "line-through opacity-60")}>
                              {it.course ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", courseColor(it.course.color).bg)} /> : null}
                              <span className="truncate">{it.title}</span>
                            </Link>
                          </li>
                        ))}
                        {list.length > 3 && (
                          <li><a href={`#day-${k}`} className="block px-1.5 text-[11px] font-medium text-brand-700 hover:underline">+{list.length - 3} more</a></li>
                        )}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          <section aria-label={`Agenda for ${monthLabel(first)}`} className={cn(view === "month" && "md:hidden")}>
            {monthDays.length === 0 ? (
              <Card><EmptyState icon={CalendarDays} title="Nothing this month">No due dates or events in {monthLabel(first)}.</EmptyState></Card>
            ) : (
              <div className="space-y-4">
                {monthDays.map(([k, list]) => {
                  const d = new Date(`${k}T00:00:00`);
                  return (
                    <Card key={k} id={`day-${k}`} className="scroll-mt-20">
                      <h3 className={cn("border-b border-slate-100 px-5 py-3 text-sm font-semibold", k === todayKey ? "text-brand-700" : "text-slate-900")}>
                        {k === todayKey ? "Today · " : ""}{dayLabel(d)}
                      </h3>
                      <ul className="divide-y divide-slate-100">{list.map((it) => <AgendaRow key={it.key} it={it} />)}</ul>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
          {view === "month" && monthDays.length > 0 && (
            <p className="hidden text-sm text-slate-500 md:block">Switch to <Link href={qs(cur, "list")} className="font-medium text-brand-700 hover:underline">List</Link> for details and event times.</p>
          )}
        </div>

        {canAdd && (
          <Card className="self-start">
            <CardHeader title="Add an event" description="Field trips, tests, holidays, parent meetings…" />
            <div className="p-5">
              <SimpleForm
                action={createEvent}
                resetOnSuccess
                submitLabel="Add to calendar"
                pendingLabel="Adding…"
                fields={[
                  { name: "title", label: "Title", required: true, placeholder: "e.g. Science fair" },
                  {
                    name: "courseId", label: "Who sees it", type: "select",
                    options: [...(user.role === "ADMIN" ? [{ value: "", label: "Whole school" }] : []), ...myCourses.map((c) => ({ value: c.id, label: c.title }))],
                  },
                  { name: "startsAt", label: "Starts", type: "datetime-local", required: true, defaultValue: toLocalInput(defaultStart) },
                  { name: "endsAt", label: "Ends", type: "datetime-local", hint: "Optional." },
                  { name: "allDay", label: "All day?", type: "select", options: [{ value: "no", label: "No, at a set time" }, { value: "yes", label: "Yes, all day" }] },
                  { name: "location", label: "Where", placeholder: "e.g. Gym" },
                  { name: "description", label: "Details", type: "textarea", rows: 3 },
                ]}
              />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function AgendaRow({ it }: { it: Item }) {
  const K = KIND[it.kind];
  const when = it.allDay ? "All day" : `${time(it.at)}${it.end && it.end.toDateString() === it.at.toDateString() ? ` – ${time(it.end)}` : ""}`;
  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg",
        it.kind === "event" ? "bg-violet-50 text-violet-700" : it.kind === "exam" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600")}>
        <K.icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium text-slate-900", it.done && "text-slate-500 line-through")}>{it.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span>{K.label} · {when}</span>
          {it.course && <span className="inline-flex items-center gap-1"><CourseDot color={it.course.color} />{it.course.title}</span>}
          {it.kind === "event" && !it.course && <span>Whole school</span>}
          {it.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{it.location}</span>}
        </span>
        {it.description && <span className="mt-1 block whitespace-pre-line text-sm text-slate-600">{it.description}</span>}
      </span>
      {it.done && <Badge tone="success">Done</Badge>}
    </>
  );
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      {it.href ? <Link href={it.href} className={cn("-m-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 hover:bg-slate-50", focusRing)}>{body}</Link> : <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>}
      {it.deleteId && (
        <form action={deleteEvent.bind(null, it.deleteId)}>
          <ConfirmButton message={`Delete "${it.title}" from the calendar?`} aria-label={`Delete ${it.title}`}
            className={cn("flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600", focusRing)}>
            <Trash2 className="size-4" aria-hidden />
          </ConfirmButton>
        </form>
      )}
    </li>
  );
}
