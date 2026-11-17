"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Contact,
  FileBadge,
  Library,
  LineChart,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn, ROLE_LABEL } from "@/lib/utils";
import { Avatar, focusRing } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon; roles?: string[] };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "Courses", icon: BookOpen, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/assignments", label: "Assignments", icon: ClipboardList, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/grades", label: "Grades", icon: BarChart3, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/report-cards", label: "Report cards", icon: FileBadge, roles: ["ADMIN", "STUDENT", "PARENT"] },
  { href: "/students", label: "Students", icon: Contact, roles: ["TEACHER", "ADMIN"] },
  { href: "/bank", label: "Question bank", icon: Library, roles: ["TEACHER", "ADMIN"] },
  { href: "/admin/insights", label: "Insights", icon: LineChart, roles: ["ADMIN"] },
  { href: "/admin/users", label: "People", icon: Users, roles: ["ADMIN"] },
  { href: "/admin/settings", label: "School settings", icon: Settings, roles: ["ADMIN"] },
];

export function AppShell({
  user,
  schoolName,
  logoUrl,
  logoutAction,
  children,
}: {
  user: { name: string; email: string; role: string; avatarUrl: string | null };
  schoolName: string;
  logoUrl: string | null;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const items = NAV.filter((i) => !i.roles || i.roles.includes(user.role));
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-20 items-center gap-3 px-5">
        <SchoolMark logoUrl={logoUrl} />
        <div className="min-w-0 leading-tight">
          <div className="truncate font-display text-[1.05rem] font-semibold text-slate-900">{schoolName}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Campus LMS</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                    focusRing,
                    active
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900",
                  )}
                >
                  {active && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-1.5 rounded-r-full bg-brand-600" />}
                  <span className={cn("flex size-7 items-center justify-center rounded-lg", active ? "bg-brand-600 text-white" : "text-slate-500")}>
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-slate-200/80 p-3">
        <div className="flex items-center gap-1">
          <Link
            href="/account"
            aria-current={isActive("/account") ? "page" : undefined}
            className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-900/5", isActive("/account") && "bg-white shadow-sm ring-1 ring-slate-200", focusRing)}
          >
            <Avatar name={user.name} src={user.avatarUrl} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-slate-900">{user.name}</span>
              <span className="block truncate text-xs text-slate-500">{ROLE_LABEL[user.role]} · My account</span>
            </span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className={cn("flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-900/5 hover:text-slate-900", focusRing)}
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const bottom = items.filter((i) => ["/dashboard", "/courses", "/calendar", "/assignments", "/grades", "/report-cards"].includes(i.href)).slice(0, 5);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-700 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/80 bg-slate-100/80 backdrop-blur lg:block print:hidden">{sidebar}</aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200/80 bg-paper/90 px-2 backdrop-blur lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-drawer"
          className={cn("flex size-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100", focusRing)}
        >
          <Menu className="size-6" aria-hidden />
        </button>
        <span className="truncate px-2 font-display text-base font-semibold text-slate-900">{schoolName}</span>
        <Link href="/account" aria-label="My account" className={cn("flex size-11 items-center justify-center rounded-lg", focusRing)}>
          <Avatar name={user.name} size="sm" src={user.avatarUrl} />
        </Link>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" id="mobile-drawer" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-100 shadow-xl">
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className={cn("absolute right-2 top-3 flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100", focusRing)}
            >
              <X className="size-5" aria-hidden />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main id="main" className="pb-28 lg:pb-0 lg:pl-64 print:p-0">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8 lg:px-8 print:max-w-none print:p-0">{children}</div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-2 bottom-2 z-20 rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur mb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
      >
        <ul className="grid p-1" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
          {bottom.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold",
                    focusRing,
                    active ? "bg-brand-50 text-brand-800" : "text-slate-500",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function SchoolMark({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className="size-11 shrink-0 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200" />;
  }
  return (
    <span className="flex size-11 shrink-0 rotate-[-4deg] items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
      <GraduationCap className="size-6" aria-hidden />
    </span>
  );
}
