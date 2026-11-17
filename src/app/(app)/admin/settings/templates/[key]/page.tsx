import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";
import { renderTemplate, sampleVariables, TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from "@/lib/email-templates";
import { applyTemplate, deleteTemplate, saveTemplate, testTemplate } from "@/app/admin-actions";
import { Alert, Badge, ButtonLink, Card, CardHeader, PageHeader, focusRing } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { TemplateEditor } from "@/components/template-editor";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit email template" };

type P = { params: Promise<{ key: string }>; searchParams: Promise<{ draft?: string; from?: string; saved?: string }> };

export default async function TemplatePage({ params, searchParams }: P) {
  const admin = await requireUser(["ADMIN"]);
  const { key } = await params;
  const { draft, from, saved } = await searchParams;
  if (!(TEMPLATE_KEYS as string[]).includes(key)) notFound();
  const k = key as TemplateKey;
  const def = TEMPLATES[k];
  const [drafts, emailOn] = await Promise.all([db.emailTemplate.findMany({ where: { key: k }, orderBy: { updatedAt: "desc" } }), isEmailConfigured()]);
  const active = drafts.find((d) => d.active);
  const editing = draft && draft !== "new" ? drafts.find((d) => d.id === draft) : undefined;
  if (draft && draft !== "new" && !editing) notFound();
  const source = editing ?? drafts.find((d) => d.id === from) ?? def.defaults;
  const school = { name: admin.school.name, brandColor: admin.school.brandColor };
  const defaultPreview = renderTemplate(k, def.defaults, sampleVariables(k), school);
  const actionBtn = cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", focusRing);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/settings/templates" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ChevronLeft className="size-4" aria-hidden />All email templates
      </Link>
      <PageHeader title={def.label} description={def.description}
        actions={<ButtonLink href={`/admin/settings/templates/${k}?draft=new`}><Plus className="size-4" aria-hidden />New draft</ButtonLink>} />

      {saved && <div className="mb-4"><Alert>{saved === "used" ? "Saved. This template is now used for every email of this type." : "Draft saved. It isn't used until you choose \"Save and use\"."}</Alert></div>}

      <Card className="mb-6">
        <CardHeader title="Versions" description="Only one version is used at a time. You can always go back to the default." />
        <ul className="divide-y divide-slate-100">
          <li className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900">Built-in default</span>
              <span className="block text-xs text-slate-500">Written by Campus LMS</span>
            </span>
            {!active ? <Badge tone="success">In use</Badge> : (
              <form action={applyTemplate.bind(null, k, null)}><SubmitButton variant="secondary" pendingText="Switching…">Use default</SubmitButton></form>
            )}
            <Link href={`/admin/settings/templates/${k}?draft=new`} className={cn(actionBtn, "text-slate-700 hover:bg-slate-100")}><Copy className="size-4" aria-hidden />Copy</Link>
          </li>
          {drafts.map((d) => (
            <li key={d.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", editing?.id === d.id && "bg-brand-50/50")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{d.name}</span>
                <span className="block text-xs text-slate-500">Edited {timeAgo(d.updatedAt)}</span>
              </span>
              {d.active ? <Badge tone="success">In use</Badge> : (
                <form action={applyTemplate.bind(null, k, d.id)}><SubmitButton variant="secondary" pendingText="Switching…">Use this</SubmitButton></form>
              )}
              <Link href={`/admin/settings/templates/${k}?draft=${d.id}`} aria-current={editing?.id === d.id ? "page" : undefined} className={cn(actionBtn, "text-brand-700 hover:bg-brand-50")}>
                <Pencil className="size-4" aria-hidden />Edit<span className="sr-only"> {d.name}</span>
              </Link>
              <Link href={`/admin/settings/templates/${k}?draft=new&from=${d.id}`} className={cn(actionBtn, "text-slate-700 hover:bg-slate-100")}>
                <Copy className="size-4" aria-hidden />Copy<span className="sr-only"> {d.name}</span>
              </Link>
              <form action={deleteTemplate.bind(null, k, d.id)}>
                <ConfirmButton message={`Delete the draft "${d.name}"?${d.active ? " Emails will use the default again." : ""}`} aria-label={`Delete ${d.name}`}
                  className={cn("flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600", focusRing)}>
                  <Trash2 className="size-4" aria-hidden />
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      {draft ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{editing ? `Editing "${editing.name}"` : "New draft"}</h2>
          <TemplateEditor
            key={editing?.id ?? `new-${from ?? ""}`}
            templateKey={k}
            initial={{ subject: source.subject, heading: source.heading, body: source.body, buttonLabel: source.buttonLabel }}
            initialName={editing?.name ?? (from && "name" in source ? `Copy of ${source.name}` : `My ${def.label.toLowerCase()}`)}
            school={school}
            saveAction={saveTemplate.bind(null, k, editing?.id ?? null)}
            testAction={testTemplate.bind(null, k)}
            emailOn={emailOn}
          />
        </Card>
      ) : (
        <Card>
          <CardHeader title="The default email" description="Sample details are filled in. Choose New draft or Copy to write your own version." />
          <p className="truncate border-b border-slate-100 px-5 py-2.5 text-sm"><span className="text-slate-500">Subject: </span><span className="font-medium text-slate-900">{defaultPreview.subject}</span></p>
          <iframe title="Default email preview" srcDoc={defaultPreview.html} sandbox="" className="h-[34rem] w-full bg-slate-100" />
        </Card>
      )}
    </div>
  );
}
