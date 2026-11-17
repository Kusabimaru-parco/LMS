"use client";

import { startTransition, useActionState, useState } from "react";
import { formDataWithSubmitter } from "./use-form-action";
import { Mail, Send } from "lucide-react";
import type { FormState } from "@/app/actions";
import type { EmailFormValues } from "@/lib/email";
import { Alert, Field, Input, Select } from "./ui";
import { SubmitButton } from "./submit-button";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "none", label: "Not now", hint: "Turn email on later in School settings." },
  { id: "smtp", label: "SMTP server", hint: "Google Workspace, Microsoft 365, your own mail server…" },
  { id: "resend", label: "Resend", hint: "Email API · resend.com" },
  { id: "sendgrid", label: "SendGrid", hint: "Email API · sendgrid.com" },
  { id: "brevo", label: "Brevo", hint: "Email API · brevo.com" },
] as const;

const PRESETS = [
  { label: "Google / Gmail", host: "smtp.gmail.com", port: "587", security: "starttls", note: "Use an App Password (Google account → Security → App passwords), not your normal password." },
  { label: "Microsoft 365", host: "smtp.office365.com", port: "587", security: "starttls", note: "SMTP AUTH must be enabled for the mailbox in the Microsoft 365 admin center." },
  { label: "Other", host: "", port: "587", security: "starttls", note: "" },
];

const API_HELP: Record<string, string> = {
  resend: "Create one at resend.com → API Keys. Verify your school's domain there so emails aren't marked as spam.",
  sendgrid: "Create one at sendgrid.com → Settings → API Keys with 'Mail Send' access, and verify your sender.",
  brevo: "Create one at brevo.com → SMTP & API → API Keys, and verify your sender address.",
};

/** The email fields. Used inside the setup wizard's big form and the School settings email form. */
export function EmailSettingsFields({ initial, errors = {} }: { initial: Partial<EmailFormValues>; errors?: Record<string, string> }) {
  const [provider, setProvider] = useState<string>(initial.provider ?? "none");
  const [host, setHost] = useState(initial.smtpHost ?? "");
  const [port, setPort] = useState(String(initial.smtpPort ?? 587));
  const [security, setSecurity] = useState<string>(initial.smtpSecurity ?? "starttls");
  const [note, setNote] = useState("");
  const err = (k: string) => ({ "aria-invalid": !!errors[k] || undefined, "aria-describedby": errors[k] ? `${k}-error` : undefined });

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">How should the LMS send email?</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map((p) => (
            <label key={p.id} className={cn("flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-brand-500",
              provider === p.id ? "border-brand-600 bg-brand-50" : "border-slate-300 bg-white hover:bg-slate-50")}>
              <input type="radio" name="mailProvider" value={p.id} checked={provider === p.id} onChange={() => setProvider(p.id)} className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="block text-sm font-medium text-slate-900">{p.label}</span>
                <span className="block text-xs text-slate-500">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {provider !== "none" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Send emails from" htmlFor="mailFromEmail" required hint="e.g. no-reply@yourschool.edu" error={errors.mailFromEmail}>
            <Input id="mailFromEmail" name="mailFromEmail" type="email" defaultValue={initial.fromEmail} autoComplete="off" {...err("mailFromEmail")} />
          </Field>
          <Field label="Sender name" htmlFor="mailFromName" hint="Usually your school's name." error={errors.mailFromName}>
            <Input id="mailFromName" name="mailFromName" defaultValue={initial.fromName} {...err("mailFromName")} />
          </Field>
        </div>
      )}

      {provider === "smtp" && (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-800">Quick setup</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => { setHost(p.host); setPort(p.port); setSecurity(p.security); setNote(p.note); }}
                  className="inline-flex min-h-10 items-center rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  {p.label}
                </button>
              ))}
            </div>
            {note && <p className="mt-2 text-xs text-slate-600" role="status">{note}</p>}
          </div>
          <div className="grid gap-5 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <Field label="SMTP server" htmlFor="smtpHost" required error={errors.smtpHost}>
                <Input id="smtpHost" name="smtpHost" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.yourschool.edu" autoComplete="off" {...err("smtpHost")} />
              </Field>
            </div>
            <div className="sm:col-span-1">
              <Field label="Port" htmlFor="smtpPort" required error={errors.smtpPort}>
                <Input id="smtpPort" name="smtpPort" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} {...err("smtpPort")} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Security" htmlFor="smtpSecurity">
                <Select id="smtpSecurity" name="smtpSecurity" value={security} onChange={(e) => setSecurity(e.target.value)}>
                  <option value="starttls">STARTTLS (port 587)</option>
                  <option value="tls">SSL/TLS (port 465)</option>
                  <option value="none">None (port 25, not secure)</option>
                </Select>
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Username" htmlFor="smtpUser" hint="Often the full email address.">
                <Input id="smtpUser" name="smtpUser" defaultValue={initial.smtpUser} autoComplete="off" aria-describedby="smtpUser-hint" />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Password" htmlFor="smtpPass" hint={initial.hasSmtpPass ? "Saved and encrypted. Leave empty to keep it." : "Stored encrypted."}>
                <Input id="smtpPass" name="smtpPass" type="password" autoComplete="new-password" placeholder={initial.hasSmtpPass ? "••••••••" : ""} aria-describedby="smtpPass-hint" />
              </Field>
            </div>
          </div>
        </div>
      )}

      {(provider === "resend" || provider === "sendgrid" || provider === "brevo") && (
        <Field label="API key" htmlFor="mailApiKey" required error={errors.mailApiKey}
          hint={`${API_HELP[provider]} ${initial.hasApiKey ? "A key is saved; leave empty to keep it." : "Stored encrypted."}`}>
          <Input id="mailApiKey" name="mailApiKey" type="password" autoComplete="off" placeholder={initial.hasApiKey ? "••••••••" : ""} {...err("mailApiKey")}
            aria-describedby={errors.mailApiKey ? "mailApiKey-error" : "mailApiKey-hint"} />
        </Field>
      )}
    </div>
  );
}

/** School settings → Email: save, or send a test email with the values in the form (without saving). */
export function EmailSettingsForm({
  initial,
  siteUrl,
  saveAction,
  testAction,
}: {
  initial: EmailFormValues;
  siteUrl: string;
  saveAction: (s: FormState, f: FormData) => Promise<FormState>;
  testAction: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const [saved, save, saving] = useActionState(saveAction, undefined);
  const [tested, test, testing] = useActionState(testAction, undefined);
  const [last, setLast] = useState<"save" | "test">("save");
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || testing) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const isTest = submitter?.getAttribute("value") === "test";
    const data = formDataWithSubmitter(e.currentTarget, submitter);
    setLast(isTest ? "test" : "save");
    startTransition(() => (isTest ? test(data) : save(data)));
  }
  const state = last === "save" ? saved : tested;
  const errors = state?.errors ?? {};

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Site address" htmlFor="siteUrl" error={errors.siteUrl}
        hint="The address people type to open the LMS. Used for links in emails, e.g. https://lms.yourschool.edu or http://192.168.1.20:3000">
        <Input id="siteUrl" name="siteUrl" type="url" defaultValue={siteUrl} placeholder="https://" aria-describedby={errors.siteUrl ? "siteUrl-error" : "siteUrl-hint"} />
      </Field>
      <EmailSettingsFields initial={initial} errors={errors} />
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <SubmitButton variant="secondary" pendingText="Sending…" pending={testing} name="intent" value="test">
          <Send className="size-4" aria-hidden />Send test email
        </SubmitButton>
        <SubmitButton pendingText="Saving…" pending={saving} name="intent" value="save"><Mail className="size-4" aria-hidden />Save email settings</SubmitButton>
      </div>
    </form>
  );
}
