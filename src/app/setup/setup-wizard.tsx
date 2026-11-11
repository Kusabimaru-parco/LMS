"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  GraduationCap,
  ImageUp,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { completeSetup, checkSetupCode } from "./actions";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";

export type SystemCheck = { label: string; ok: boolean; warn?: boolean; detail: string };

const STEPS = [
  { title: "Welcome", fields: ["setupCode"] },
  { title: "School details", fields: ["name", "academicYear", "address", "phone", "email", "website", "timezone"] },
  { title: "Branding", fields: ["logo", "brandColor"] },
  { title: "Administrator", fields: ["adminName", "adminEmail", "adminPassword", "adminPasswordConfirm"] },
  { title: "Review", fields: [] },
];

const PRESET_COLORS = ["#4f46e5", "#1d4ed8", "#0f766e", "#15803d", "#b91c1c", "#9d174d", "#7e22ce", "#334155"];

function contrastWithWhite(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (L + 0.05);
}

export function SetupWizard({ checks }: { checks: SystemCheck[] }) {
  const [state, action] = useActionState(completeSetup, undefined);
  const [step, setStep] = useState(0);
  const [codeOk, setCodeOk] = useState(false);
  const [codeMsg, setCodeMsg] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string>();
  const [timezone, setTimezone] = useState("UTC");
  const [timezones, setTimezones] = useState<string[]>(["UTC"]);
  const [review, setReview] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const blocked = checks.some((c) => !c.ok && !c.warn && c.label === "Database connected");
  const e = state?.errors ?? {};

  useEffect(() => {
    setTimezones(Intl.supportedValuesOf("timeZone"));
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  // After a failed submit, jump to the first step with an error.
  useEffect(() => {
    if (!state?.errors) return;
    const first = STEPS.findIndex((s) => s.fields.some((f) => state.errors?.[f]));
    if (first >= 0) setStep(first);
  }, [state]);

  useEffect(() => headingRef.current?.focus(), [step]);

  function validateStep() {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const inputs = section ? [...section.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")] : [];
    const pw = formRef.current?.elements.namedItem("adminPassword") as HTMLInputElement | null;
    const confirm = formRef.current?.elements.namedItem("adminPasswordConfirm") as HTMLInputElement | null;
    if (step === 3 && confirm && pw) confirm.setCustomValidity(confirm.value && confirm.value !== pw.value ? "The passwords don't match." : "");
    for (const el of inputs) if (!el.checkValidity()) return el.reportValidity(), false;
    return !logoError;
  }

  async function next() {
    if (!validateStep()) return;
    if (step === 0) {
      const code = (formRef.current?.elements.namedItem("setupCode") as HTMLInputElement).value;
      setChecking(true);
      const r = await checkSetupCode(code);
      setChecking(false);
      setCodeOk(r.ok);
      setCodeMsg(r.message);
      if (!r.ok) return;
    }
    if (step === 3) {
      const fd = new FormData(formRef.current!);
      setReview(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  }

  function onLogo(file: File | undefined) {
    setLogoError(undefined);
    if (!file) return setLogoPreview(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setLogoError("Upload a PNG, JPG or WebP image.");
    if (file.size > 1024 * 1024) return setLogoError("The logo must be smaller than 1 MB.");
    setLogoPreview(URL.createObjectURL(file));
  }

  const ratio = contrastWithWhite(color);
  const err = (k: string) => ({ "aria-invalid": !!e[k] || undefined, "aria-describedby": e[k] ? `${k}-error` : undefined });

  return (
    <div className="min-h-dvh bg-slate-50" style={{ ["--brand" as string]: color }}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-2.5 px-4 sm:px-6">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap className="size-5" aria-hidden />
          </span>
          <span className="font-semibold text-slate-900">Campus LMS</span>
          <span className="ml-auto text-sm text-slate-500">First-time setup</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Stepper */}
        <nav aria-label="Setup progress" className="mb-8">
          <p className="mb-2 text-sm font-medium text-slate-600 sm:hidden">Step {step + 1} of {STEPS.length}: {STEPS[step].title}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 sm:hidden" aria-hidden>
            <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <ol className="hidden items-center sm:flex">
            {STEPS.map((s, i) => {
              const done = i < step;
              const current = i === step;
              const hasError = s.fields.some((f) => e[f]);
              return (
                <li key={s.title} className="flex flex-1 items-center last:flex-none" aria-current={current ? "step" : undefined}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                        hasError ? "bg-rose-600 text-white" : done ? "bg-brand-600 text-white" : current ? "border-2 border-brand-600 text-brand-700" : "border border-slate-300 text-slate-500",
                      )}
                    >
                      {hasError ? "!" : done ? <Check className="size-4" aria-hidden /> : i + 1}
                    </span>
                    <span className={cn("text-sm font-medium", current ? "text-slate-900" : "text-slate-500")}>
                      {s.title}
                      {done && <span className="sr-only"> (done)</span>}
                    </span>
                  </span>
                  {i < STEPS.length - 1 && <span aria-hidden className={cn("mx-3 h-px flex-1", done ? "bg-brand-600" : "bg-slate-300")} />}
                </li>
              );
            })}
          </ol>
        </nav>

        <form ref={formRef} action={action} noValidate onSubmit={(ev) => {
            if (step === STEPS.length - 1) return;
            ev.preventDefault(); // Enter key on earlier steps moves forward instead of submitting
            void next();
          }}
          onKeyDown={(ev) => {
            // Browsers don't submit multi-field forms on Enter when there is no submit button, so handle it here.
            const t = ev.target as HTMLElement;
            if (ev.key === "Enter" && step < STEPS.length - 1 && t.tagName === "INPUT") {
              ev.preventDefault();
              void next();
            }
          }}>
          {state?.message && <div className="mb-6"><Alert tone="danger">{state.message}</Alert></div>}

          {/* Step 1: Welcome + system check */}
          <Section step={0} current={step} title="Welcome! Let's set up your school" headingRef={headingRef}
            description="This takes about 5 minutes and only happens once. You can change everything later in School settings.">
            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-base font-semibold text-slate-900">System check</h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-3 px-5 py-3">
                    {c.ok ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Passed" />
                    ) : c.warn ? (
                      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" aria-label="Warning" />
                    ) : (
                      <XCircle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-label="Failed" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{c.label}</p>
                      <p className="break-words text-xs text-slate-500">{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="mt-6 p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <KeyRound className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <Field label="Setup code" htmlFor="setupCode" required
                    hint="Shown in the server logs when Campus LMS starts, and printed by the installer. It proves you control this server."
                    error={codeMsg ?? e.setupCode}>
                    <Input id="setupCode" name="setupCode" required autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX"
                      className="font-mono uppercase tracking-widest" readOnly={codeOk} onChange={() => setCodeMsg(undefined)}
                      aria-invalid={!!codeMsg || undefined} aria-describedby={codeMsg ? "setupCode-error" : "setupCode-hint"} />
                  </Field>
                  {codeOk && <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700"><ShieldCheck className="size-4" aria-hidden />Code accepted</p>}
                </div>
              </div>
            </Card>
          </Section>

          {/* Step 2: School details */}
          <Section step={1} current={step} title="Tell us about your school" headingRef={headingRef}
            description="This appears on the sign-in page, in the app and in emails.">
            <Card className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
              <div className="sm:col-span-2">
                <Field label="School name" htmlFor="name" required error={e.name}>
                  <Input id="name" name="name" required minLength={2} maxLength={120} value={schoolName} onChange={(ev) => setSchoolName(ev.target.value)}
                    placeholder="e.g. Northfield Academy" autoComplete="organization" {...err("name")} />
                </Field>
              </div>
              <Field label="School year" htmlFor="academicYear" hint="e.g. 2026–2027" error={e.academicYear}>
                <Input id="academicYear" name="academicYear" maxLength={40} {...err("academicYear")} />
              </Field>
              <Field label="Timezone" htmlFor="timezone" required hint="Used for due dates and reminders." error={e.timezone}>
                <select id="timezone" name="timezone" required value={timezone} onChange={(ev) => setTimezone(ev.target.value)}
                  className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:min-h-10 sm:text-sm">
                  {timezones.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address" htmlFor="address" error={e.address}>
                  <Input id="address" name="address" maxLength={300} autoComplete="street-address" {...err("address")} />
                </Field>
              </div>
              <Field label="Phone" htmlFor="phone" error={e.phone}>
                <Input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" {...err("phone")} />
              </Field>
              <Field label="School email" htmlFor="email" error={e.email}>
                <Input id="email" name="email" type="email" placeholder="office@school.edu" {...err("email")} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Website" htmlFor="website" error={e.website}>
                  <Input id="website" name="website" type="url" placeholder="https://" {...err("website")} />
                </Field>
              </div>
            </Card>
          </Section>

          {/* Step 3: Branding */}
          <Section step={2} current={step} title="Make it look like your school" headingRef={headingRef}
            description="Your logo and colour are shown to every teacher and student.">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-6 p-5 sm:p-6">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-800">School logo</p>
                  <div className="flex items-center gap-4">
                    <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                      {logoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoPreview} alt="Logo preview" className="size-full object-contain p-1" />
                      ) : (
                        <ImageUp className="size-7 text-slate-400" aria-hidden />
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="logo" className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500 sm:min-h-10">
                        {logoPreview ? "Change logo" : "Upload logo"}
                        <input ref={logoRef} id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                          onChange={(ev) => onLogo(ev.target.files?.[0])} aria-describedby="logo-hint" />
                      </label>
                      {logoPreview && (
                        <button type="button" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-rose-600"
                          onClick={() => { if (logoRef.current) logoRef.current.value = ""; setLogoPreview(null); }}>
                          <Trash2 className="size-4" aria-hidden /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <p id="logo-hint" className="mt-2 text-xs text-slate-500">Square PNG, JPG or WebP, up to 1 MB. Optional.</p>
                  {(logoError ?? e.logo) && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{logoError ?? e.logo}</p>}
                </div>

                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium text-slate-800">Brand colour</legend>
                  <div className="flex flex-wrap items-center gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Use colour ${c}`} aria-pressed={color === c}
                        className={cn("size-9 rounded-full ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900", color === c && "ring-2 ring-slate-900")}
                        style={{ background: c }} />
                    ))}
                    <label className="ml-1 inline-flex items-center gap-2 text-sm text-slate-600">
                      <input type="color" name="brandColor" value={color} onChange={(ev) => setColor(ev.target.value)}
                        className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
                      Custom
                    </label>
                  </div>
                  {ratio < 4.5 ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <AlertTriangle className="size-4" aria-hidden />This colour is too light for white text (contrast {ratio.toFixed(1)}:1). Choose a darker shade.
                    </p>
                  ) : (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                      <CheckCircle2 className="size-4" aria-hidden />Good contrast ({ratio.toFixed(1)}:1). Easy to read.
                    </p>
                  )}
                </fieldset>
              </Card>

              {/* Live preview */}
              <div aria-label="Preview" role="img" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreview} alt="" className="size-9 rounded-lg object-contain" />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white"><GraduationCap className="size-5" /></span>
                  )}
                  <span className="truncate text-sm font-semibold text-slate-900">{schoolName || "Your school"}</span>
                </div>
                <div className="space-y-1 p-3">
                  {["Dashboard", "Courses", "Assignments"].map((l, i) => (
                    <div key={l} className={cn("rounded-lg px-3 py-2 text-sm font-medium", i === 0 ? "bg-brand-50 text-brand-700" : "text-slate-600")}>{l}</div>
                  ))}
                </div>
                <div className="m-3 rounded-lg bg-brand-600 p-4 text-white">
                  <p className="text-xs opacity-90">Preview</p>
                  <p className="font-semibold">Welcome to {schoolName || "your school"}</p>
                  <span className="mt-3 inline-block rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-brand-700">Get started</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Step 4: Admin */}
          <Section step={3} current={step} title="Create your administrator account" headingRef={headingRef}
            description="This person manages the school: adding teachers and students, courses and settings.">
            <Card className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
              <Field label="Full name" htmlFor="adminName" required error={e.adminName}>
                <Input id="adminName" name="adminName" required minLength={2} autoComplete="name" {...err("adminName")} />
              </Field>
              <Field label="Email" htmlFor="adminEmail" required hint="Used to sign in." error={e.adminEmail}>
                <Input id="adminEmail" name="adminEmail" type="email" required autoComplete="username" {...err("adminEmail")} />
              </Field>
              <Field label="Password" htmlFor="adminPassword" required hint="At least 10 characters, with a letter and a number." error={e.adminPassword}>
                <Input id="adminPassword" name="adminPassword" type="password" required minLength={10} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{10,}"
                  autoComplete="new-password" {...err("adminPassword")} />
              </Field>
              <Field label="Confirm password" htmlFor="adminPasswordConfirm" required error={e.adminPasswordConfirm}>
                <Input id="adminPasswordConfirm" name="adminPasswordConfirm" type="password" required autoComplete="new-password" {...err("adminPasswordConfirm")} />
              </Field>
            </Card>
          </Section>

          {/* Step 5: Review */}
          <Section step={4} current={step} title="Everything look right?" headingRef={headingRef}
            description="Check the details below, then finish setup. You'll be signed in as the administrator.">
            <Card>
              <dl className="divide-y divide-slate-100">
                {[
                  ["School", review.name, 1],
                  ["School year", review.academicYear, 1],
                  ["Timezone", review.timezone, 1],
                  ["Contact", [review.email, review.phone].filter(Boolean).join(" · "), 1],
                  ["Address", review.address, 1],
                  ["Logo", logoPreview ? "Uploaded" : "None (you can add one later)", 2],
                  ["Brand colour", review.brandColor, 2],
                  ["Administrator", review.adminName ? `${review.adminName} (${review.adminEmail})` : "", 3],
                ].map(([label, value, goto]) => (
                  <div key={label as string} className="flex items-center gap-4 px-5 py-3">
                    <dt className="w-32 shrink-0 text-sm text-slate-500">{label}</dt>
                    <dd className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-slate-900">
                      {label === "Brand colour" && <span aria-hidden className="size-4 rounded-full" style={{ background: color }} />}
                      <span className="truncate">{(value as string) || "—"}</span>
                    </dd>
                    <button type="button" onClick={() => setStep(goto as number)} className="shrink-0 text-sm font-medium text-brand-700 hover:underline">
                      Edit<span className="sr-only"> {label as string}</span>
                    </button>
                  </div>
                ))}
              </dl>
            </Card>
          </Section>

          {/* Footer navigation */}
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="size-4" aria-hidden /> Back
              </Button>
            ) : <span />}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next} disabled={checking || blocked}>
                {checking && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {step === 0 ? "Get started" : "Continue"} {!checking && <ArrowRight className="size-4" aria-hidden />}
              </Button>
            ) : (
              <SubmitButton pendingText="Setting up your school…">Finish setup</SubmitButton>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

function Section({
  step,
  current,
  title,
  description,
  headingRef,
  children,
}: {
  step: number;
  current: number;
  title: string;
  description: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}) {
  const active = step === current;
  return (
    <section data-step={step} hidden={!active} aria-labelledby={active ? `step-${step}-title` : undefined}>
      <div className="mb-6">
        <h1 id={`step-${step}-title`} ref={active ? headingRef : undefined} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-slate-900 focus:outline-none sm:text-[1.75rem]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">{description}</p>
      </div>
      {children}
    </section>
  );
}
