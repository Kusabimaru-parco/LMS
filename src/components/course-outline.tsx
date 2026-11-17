// Course outline building blocks: activity rows for lessons, assignments, quizzes and exams.
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, ChevronRight, Circle, ClipboardCheck, ClipboardList, FileText, Timer } from "lucide-react";
import { AssignmentStatus } from "./lms";
import { Badge } from "./ui";
import { formatDue } from "@/lib/utils";
import { formatScore, quizState, resultsVisible } from "@/lib/quiz";

/** Prisma include for everything an outline shows inside a module (or the course's loose items). */
export function activityInclude(userId: string, isStudent: boolean) {
  return {
    lessons: { orderBy: { position: "asc" }, select: { id: true, title: true, progress: { where: { userId }, select: { userId: true } } } },
    assignments: {
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        title: true,
        dueAt: true,
        points: true,
        submissions: { where: isStudent ? { studentId: userId } : {}, select: { score: true, gradedAt: true, submittedAt: true } },
      },
    },
    quizzes: {
      where: isStudent ? { published: true } : {},
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        kind: true,
        published: true,
        opensAt: true,
        closesAt: true,
        timeLimitMin: true,
        showResults: true,
        _count: { select: { questions: true } },
        attempts: {
          where: isStudent ? { studentId: userId } : { submittedAt: { not: null } },
          select: { studentId: true, score: true, maxScore: true, submittedAt: true, needsReview: true },
        },
      },
    },
  } satisfies Prisma.ModuleInclude;
}

type Activities = Prisma.ModuleGetPayload<{ include: ReturnType<typeof activityInclude> }>;
type ActivityData = Pick<Activities, "lessons" | "assignments" | "quizzes">;

export function activityCount(a: ActivityData) {
  return a.lessons.length + a.assignments.length + a.quizzes.length;
}

/** For students: how many items in the module are done (lessons read, work handed in, quizzes taken). */
export function doneCount(a: ActivityData) {
  return (
    a.lessons.filter((l) => l.progress.length).length +
    a.assignments.filter((x) => x.submissions.length).length +
    a.quizzes.filter((q) => q.attempts.some((t) => t.submittedAt)).length
  );
}

function Row({ href, icon: Icon, title, meta, right }: { href: string; icon: typeof FileText; label: string; title: string; meta?: string; right?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{title}</span>
          {meta && <span className="block truncate text-xs text-slate-500">{meta}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {right}
          <ChevronRight className="hidden size-4 text-slate-400 sm:block" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

export function QuizBadge({ q, isStudent }: { q: ActivityData["quizzes"][number]; isStudent: boolean }) {
  const state = quizState(q);
  if (!isStudent) {
    if (!q.published) return <Badge>Draft</Badge>;
    const review = q.attempts.filter((a) => a.needsReview).length;
    if (review) return <Badge tone="warning">{review} to review</Badge>;
    const students = new Set(q.attempts.map((a) => a.studentId)).size;
    return <Badge tone={students ? "success" : "neutral"}>{students} submitted</Badge>;
  }
  const attempts = q.attempts;
  const done = attempts.filter((a) => a.submittedAt);
  if (attempts.some((a) => !a.submittedAt) && state === "open") return <Badge tone="warning" icon={Timer}>In progress</Badge>;
  if (done.length) {
    const best = done.reduce((b, a) => ((a.score ?? 0) > (b.score ?? 0) ? a : b));
    if (best.needsReview) return <Badge tone="brand">Waiting for grade</Badge>;
    if (resultsVisible(q).score) return <Badge tone="success" icon={CheckCircle2}>{formatScore(best.score)}/{best.maxScore}</Badge>;
    return <Badge tone="success" icon={CheckCircle2}>Done</Badge>;
  }
  if (state === "upcoming") return <Badge>Opens {formatDue(q.opensAt!)}</Badge>;
  if (state === "closed") return <Badge tone="danger">Missed</Badge>;
  if (q.closesAt && q.closesAt.getTime() - Date.now() < 48 * 3_600_000) return <Badge tone="warning">Due soon</Badge>;
  return <Badge icon={Circle}>Not started</Badge>;
}

export function ActivityList({ data, courseId, isStudent }: { data: ActivityData; courseId: string; isStudent: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {data.lessons.map((l) => (
        <Row key={l.id} href={`/courses/${courseId}/lessons/${l.id}`} icon={FileText} label="Lesson" title={l.title} meta="Lesson"
          right={isStudent ? (l.progress.length ? <CheckCircle2 className="size-5 text-emerald-600" aria-label="Completed" /> : <Circle className="size-5 text-slate-300" aria-label="Not completed" />) : undefined} />
      ))}
      {data.assignments.map((a) => (
        <Row key={a.id} href={`/courses/${courseId}/assignments/${a.id}`} icon={ClipboardList} label="Assignment" title={a.title} meta={`Assignment · Due ${formatDue(a.dueAt)}`}
          right={isStudent ? <AssignmentStatus dueAt={a.dueAt} points={a.points} submission={a.submissions[0]} /> : (
            a.submissions.some((s) => !s.gradedAt) ? <Badge tone="warning">{a.submissions.filter((s) => !s.gradedAt).length} to grade</Badge> : undefined
          )} />
      ))}
      {data.quizzes.map((q) => (
        <Row key={q.id} href={`/courses/${courseId}/quizzes/${q.id}`} icon={q.kind === "EXAM" ? ClipboardCheck : Timer} label={q.kind === "EXAM" ? "Exam" : "Quiz"} title={q.title}
          meta={[q.kind === "EXAM" ? "Exam" : "Quiz", `${q._count.questions} questions`, q.timeLimitMin ? `${q.timeLimitMin} min` : null, q.closesAt ? `Closes ${formatDue(q.closesAt)}` : null].filter(Boolean).join(" · ")}
          right={<QuizBadge q={q} isStudent={isStudent} />} />
      ))}
    </ul>
  );
}
