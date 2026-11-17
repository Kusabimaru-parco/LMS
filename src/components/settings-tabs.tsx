import Link from "next/link";
import { Building2, KeyRound, Mail, Percent, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "./ui";

const TABS = [
  { href: "/admin/settings", label: "School", icon: Building2 },
  { href: "/admin/settings/email", label: "Email", icon: Mail },
  { href: "/admin/settings/templates", label: "Email templates", icon: SquarePen },
  { href: "/admin/settings/grading", label: "Grading", icon: Percent },
  { href: "/admin/settings/sign-in", label: "Sign-in", icon: KeyRound },
];

export function SettingsTabs({ current }: { current: string }) {
  return (
    <div className="mb-6 no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <nav aria-label="Settings sections" className="flex min-w-max gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = current === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={cn("-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium", focusRing,
                active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900")}>
              <t.icon className="size-4" aria-hidden />{t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
