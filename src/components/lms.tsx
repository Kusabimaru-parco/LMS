// LMS-specific building blocks (server-safe).
import Link from "next/link";
import { AlertCircle, CheckCircle2, Circle, Clock, Send, Users, BookOpen } from "lucide-react";
import { Badge, Card, ProgressBar, focusRing } from "./ui";
import { cn, courseColor, formatDue, percent } from "@/lib/utils";
import { coverStyle } from "@/lib/patterns";

type Sub = { score: number | null; gradedAt: Date | null; submittedAt: Date } | undefined;

export function AssignmentStatus({ dueAt, points, submission }: { dueAt: Date; points: number; submission: Sub }) {
  if (submission?.gradedAt) {
    return <Badge tone="success" icon={CheckCircle2}>Graded {percent(submission.score, points)}%</Badge>;
  }
  if (submission) return <Badge tone="brand" icon={Send}>Submitted</Badge>;
  const hoursLeft = (dueAt.getTime() - Date.now()) / 3_600_000;
  if (hoursLeft < 0) return <Badge tone="danger" icon={AlertCircle}>Missing</Badge>;
  if (hoursLeft < 48) return <Badge tone="warning" icon={Clock}>Due soon</Badge>;
  return <Badge icon={Circle}>Not started</Badge>;
}

export function CourseDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", courseColor(color).bg, className)} />;
}

export function CourseCard({
  course,
  showProgress,
}: {
  course: {
    id: string;
    title: string;
    code: string;
    color: string;
    description: string;
    progress: number;
    teacher: { name: string } | null;
    _count: { enrollments: number; lessons: number; assignments?: number; quizzes?: number };
  };
  showProgress: boolean;
}) {
  const c = courseColor(course.color);
  return (
    <Link
      href={`/courses/${course.id}`}
      className={cn("group block animate-rise rounded-2xl transition-transform duration-200 hover:-translate-y-0.5", focusRing)}
    >
      <Card className="flex h-full flex-col overflow-hidden transition-shadow duration-200 group-hover:shadow-md">
        <div className={cn("relative h-24", c.bg)} style={coverStyle(course.id)}>
          <span className="absolute bottom-0 left-5 translate-y-1/2 rounded-lg bg-white px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-slate-800 shadow-sm ring-1 ring-slate-200">
            {course.code}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-5 pt-6">
          <h3 className="font-display text-lg font-semibold leading-snug text-slate-900 group-hover:text-brand-700">{course.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{course.description || "No description yet."}</p>
          <div className="mt-auto pt-4">
            {showProgress ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{course.progress}% complete</span>
                  <span>{course._count.lessons + (course._count.assignments ?? 0) + (course._count.quizzes ?? 0)} activities</span>
                </div>
                <ProgressBar value={course.progress} label={`${course.title} progress`} />
              </div>
            ) : (
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden />{course._count.enrollments} students</span>
                <span className="inline-flex items-center gap-1.5"><BookOpen className="size-4" aria-hidden />{course._count.lessons} lessons</span>
              </div>
            )}
            <p className="mt-3 truncate text-xs text-slate-500">{course.teacher?.name ?? "No teacher assigned"}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function AssignmentRow({
  href,
  title,
  course,
  dueAt,
  right,
}: {
  href: string;
  title: string;
  course: { title: string; color: string };
  dueAt: Date;
  right: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn("flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50", focusRing, "focus-visible:ring-inset focus-visible:ring-offset-0")}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
            <CourseDot color={course.color} />
            <span className="truncate">{course.title}</span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">Due {formatDue(dueAt)}</span>
          </p>
        </div>
        <div className="shrink-0">{right}</div>
      </Link>
    </li>
  );
}

/** Very small, safe Markdown renderer for lesson content: ##/### headings, - lists, paragraphs. */
export function LessonContent({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="prose-lesson">
      {blocks.map((b, i) => {
        const t = b.trim();
        if (t.startsWith("### ")) return <h3 key={i}>{t.slice(4)}</h3>;
        if (t.startsWith("## ")) return <h2 key={i}>{t.slice(3)}</h2>;
        if (t.split("\n").every((l) => l.trim().startsWith("- ")))
          return <ul key={i}>{t.split("\n").map((l, j) => <li key={j}>{l.trim().slice(2)}</li>)}</ul>;
        // Heading followed by list in same block
        const lines = t.split("\n");
        if (lines[0].startsWith("#")) {
          return (
            <div key={i}>
              {lines[0].startsWith("### ") ? <h3>{lines[0].slice(4)}</h3> : <h2>{lines[0].replace(/^#+\s*/, "")}</h2>}
              <LessonContent text={lines.slice(1).join("\n")} />
            </div>
          );
        }
        return <p key={i} className="whitespace-pre-line">{t}</p>;
      })}
    </div>
  );
}
