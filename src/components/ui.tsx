// Shared UI primitives. Follow .claude/skills/ui-ux-design/SKILL.md when adding variants.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const btnBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[background-color,box-shadow,transform] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 " +
  focusRing;
export const btnVariants = {
  primary: "bg-brand-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.12)] hover:bg-brand-700",
  secondary: "border border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-900/5",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
};
export type BtnVariant = keyof typeof btnVariants;

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant }) {
  return <button className={cn(btnBase, btnVariants[variant], className)} {...p} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...p
}: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link className={cn(btnBase, btnVariants[variant], className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("min-w-0 rounded-2xl border border-slate-200/90 bg-white shadow-sm", className)} {...p} />;
}

export function CardHeader({ title, action, description }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-7 flex animate-rise flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">{eyebrow}</div>}
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight text-slate-900 sm:text-[2.125rem]">
          <span className="marker">{title}</span>
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
};
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", icon: Icon, children }: { tone?: BadgeTone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        badgeTones[tone],
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md", className, src }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string; src?: string | null }) {
  const s = { sm: "size-8 text-xs", md: "size-9 text-sm", lg: "size-12 text-base", xl: "size-24 text-2xl" }[size];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden className={cn("shrink-0 rounded-full bg-slate-100 object-cover ring-2 ring-white", s, className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 ring-2 ring-white", s, className)}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="relative mb-4 flex size-16 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rotate-6 rounded-[1.4rem] bg-brand-100" />
        <span aria-hidden className="absolute inset-0 -rotate-3 rounded-[1.4rem] border border-brand-200 bg-white" />
        <Icon className="relative size-7 text-brand-600" aria-hidden />
      </div>
      <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-600">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon }) {
  return (
    <Card className="relative overflow-hidden p-4 sm:p-5">
      <span aria-hidden className="absolute -right-6 -top-6 size-20 rounded-full bg-brand-50" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      {hint && <p className="relative mt-2 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-[width]" style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------- Forms ---------- */

const fieldBase =
  "block w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 sm:text-sm " +
  "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 aria-[invalid=true]:border-rose-500 disabled:bg-slate-50 disabled:text-slate-500";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-800">
        {label}
        {required && <span className="ml-0.5 text-rose-600" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "min-h-11 sm:min-h-10", className)} {...p} />;
}

export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "py-2.5 leading-relaxed", className)} {...p} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "min-h-11 pr-8 sm:min-h-10", className)} {...p} />;
}

export function Alert({ tone = "success", children }: { tone?: "success" | "danger" | "info"; children: ReactNode }) {
  const t = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    danger: "border-rose-200 bg-rose-50 text-rose-900",
    info: "border-brand-200 bg-brand-50 text-brand-900",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("animate-rise rounded-xl border px-4 py-3 text-sm", t)}>
      {children}
    </div>
  );
}
