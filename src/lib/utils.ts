import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

export function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/** Course accent colours. Full class names so Tailwind can see them. */
export const COURSE_COLORS: Record<string, { bg: string; soft: string; text: string; ring: string }> = {
  indigo: { bg: "bg-indigo-600", soft: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200" },
  emerald: { bg: "bg-emerald-600", soft: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  rose: { bg: "bg-rose-600", soft: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" },
  amber: { bg: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-800", ring: "ring-amber-200" },
  sky: { bg: "bg-sky-600", soft: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200" },
  violet: { bg: "bg-violet-600", soft: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200" },
  teal: { bg: "bg-teal-600", soft: "bg-teal-50", text: "text-teal-700", ring: "ring-teal-200" },
};
export const courseColor = (c: string) => COURSE_COLORS[c] ?? COURSE_COLORS.indigo;

const dayMs = 86_400_000;
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** "Today, 11:59 PM", "Tomorrow, …", "Fri, …", "Mar 3, …" */
export function formatDue(date: Date) {
  const diff = Math.round((startOfDay(date) - startOfDay(new Date())) / dayMs);
  const t = timeFmt.format(date);
  if (diff === 0) return `Today, ${t}`;
  if (diff === 1) return `Tomorrow, ${t}`;
  if (diff === -1) return `Yesterday, ${t}`;
  if (diff > 1 && diff < 7) return `${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date)}, ${t}`;
  return `${dateFmt.format(date)}, ${t}`;
}

export const formatDate = (d: Date) => fullFmt.format(d);

export function timeAgo(date: Date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return dateFmt.format(date);
}

export function percent(score: number | null | undefined, points: number) {
  if (score == null || !points) return null;
  return Math.round((score / points) * 100);
}

export function letterGrade(pct: number | null) {
  if (pct == null) return "—";
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

export const ROLE_LABEL: Record<string, string> = { ADMIN: "Administrator", TEACHER: "Teacher", STUDENT: "Student", PARENT: "Parent" };

/** Profile picture URL (versioned so browsers refetch after a change), or null for initials. */
export const avatarUrl = (u: { id: string; avatarUpdatedAt?: Date | null } | null | undefined) =>
  u?.avatarUpdatedAt ? `/api/users/${u.id}/avatar?v=${u.avatarUpdatedAt.getTime()}` : null;

/** "YYYY-MM-DDTHH:mm" for datetime-local inputs */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
