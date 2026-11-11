"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
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
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/grades", label: "Grades", icon: BarChart3 },
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
  user: { name: string; email: string; role: string };
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
      <div className="flex h-16 items-center gap-2.5 px-5">
        <SchoolMark logoUrl={logoUrl} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-slate-900">{schoolName}</div>
          <div className="text-xs text-slate-500">Campus LMS</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    focusRing,
                    active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <Icon className={cn("size-5", active ? "text-brand-600" : "text-slate-400")} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className={cn("flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900", focusRing)}
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const bottom = items.slice(0, 4);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-700 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-2 backdrop-blur lg:hidden">
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
        <span className="truncate px-2 text-sm font-semibold text-slate-900">{schoolName}</span>
        <span className="flex size-11 items-center justify-center">
          <Avatar name={user.name} size="sm" />
        </span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" id="mobile-drawer" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
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

      <main id="main" className="pb-24 lg:pb-0 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">{children}</div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {bottom.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    focusRing,
                    active ? "text-brand-700" : "text-slate-500",
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
    return <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-lg object-contain" />;
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
      <GraduationCap className="size-5" aria-hidden />
    </span>
  );
}
