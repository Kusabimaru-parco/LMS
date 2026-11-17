import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Mail } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";
import { TEMPLATE_KEYS, TEMPLATES } from "@/lib/email-templates";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";

export const metadata: Metadata = { title: "Email templates" };

export default async function TemplatesPage() {
  await requireUser(["ADMIN"]);
  const [rows, emailOn] = await Promise.all([
    db.emailTemplate.findMany({ select: { key: true, name: true, active: true } }),
    isEmailConfigured(),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="School settings" description="Write the emails the LMS sends in your school's own words. The built-in versions are always there to go back to." />
      <SettingsTabs current="/admin/settings/templates" />
      {!emailOn && (
        <div className="mb-6"><Alert tone="info">Email is off, so none of these are sent yet. You can still write your templates now. <Link href="/admin/settings/email" className="font-medium underline">Turn on email</Link></Alert></div>
      )}
      <Card>
        <ul className="divide-y divide-slate-100">
          {TEMPLATE_KEYS.map((key) => {
            const t = TEMPLATES[key];
            const mine = rows.filter((r) => r.key === key);
            const active = mine.find((r) => r.active);
            return (
              <li key={key}>
                <Link href={`/admin/settings/templates/${key}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Mail className="size-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
                    <span className="block text-sm text-slate-600">{t.description}</span>
                    <span className="mt-1.5 flex flex-wrap gap-2">
                      {active ? <Badge tone="success">Using: {active.name}</Badge> : <Badge>Using the default</Badge>}
                      {mine.length - (active ? 1 : 0) > 0 && <Badge tone="brand">{mine.length - (active ? 1 : 0)} draft{mine.length - (active ? 1 : 0) === 1 ? "" : "s"}</Badge>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
