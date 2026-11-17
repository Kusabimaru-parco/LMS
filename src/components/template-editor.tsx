"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { Check, Eye, Save, Send } from "lucide-react";
import type { FormState } from "@/app/actions";
import { renderTemplate, sampleVariables, TEMPLATES, type TemplateFields, type TemplateKey } from "@/lib/email-templates";
import { Alert, Field, Input, Textarea, focusRing } from "./ui";
import { SubmitButton } from "./submit-button";
import { formDataWithSubmitter } from "./use-form-action";
import { cn } from "@/lib/utils";

type FieldName = "subject" | "heading" | "body" | "buttonLabel";

/** Edit a template draft with a live preview. "Save draft", "Save and use", or send a test to yourself. */
export function TemplateEditor({
  templateKey,
  initial,
  initialName,
  school,
  saveAction,
  testAction,
  emailOn,
}: {
  templateKey: TemplateKey;
  initial: TemplateFields;
  initialName: string;
  school: { name: string; brandColor: string };
  saveAction: (s: FormState, f: FormData) => Promise<FormState>;
  testAction: (s: FormState, f: FormData) => Promise<FormState>;
  emailOn: boolean;
}) {
  const def = TEMPLATES[templateKey];
  const [values, setValues] = useState<TemplateFields>(initial);
  const [saved, save, saving] = useActionState(saveAction, undefined);
  const [tested, test, testing] = useActionState(testAction, undefined);
  const [last, setLast] = useState<"save" | "test">("save");
  const [focus, setFocus] = useState<FieldName>("body");
  const refs = { subject: useRef<HTMLInputElement>(null), heading: useRef<HTMLInputElement>(null), body: useRef<HTMLTextAreaElement>(null), buttonLabel: useRef<HTMLInputElement>(null) };
  const state = last === "save" ? saved : tested;
  const e = state?.errors ?? {};
  const preview = useMemo(() => renderTemplate(templateKey, values, sampleVariables(templateKey), school), [templateKey, values, school]);

  function set(k: FieldName, v: string) {
    setValues((cur) => ({ ...cur, [k]: v }));
  }

  /** Inserts {{variable}} where the cursor is in the last field you were typing in. */
  function insert(name: string) {
    const el = refs[focus].current;
    const token = `{{${name}}}`;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    set(focus, next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (saving || testing) return;
    const submitter = (ev.nativeEvent as SubmitEvent).submitter;
    const data = formDataWithSubmitter(ev.currentTarget, submitter);
    const isTest = submitter?.getAttribute("value") === "test";
    setLast(isTest ? "test" : "save");
    startTransition(() => (isTest ? test(data) : save(data)));
  }

  const err = (k: string) => ({ "aria-invalid": !!e[k] || undefined, "aria-describedby": e[k] ? `t-${k}-error` : undefined });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-5">
        {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
        <Field label="Draft name" htmlFor="t-name" required hint="Only you see this, e.g. 'Friendly welcome 2026'." error={e.name}>
          <Input id="t-name" name="name" defaultValue={initialName} required maxLength={100} {...err("name")} />
        </Field>
        <Field label="Subject" htmlFor="t-subject" required error={e.subject}>
          <Input ref={refs.subject} id="t-subject" name="subject" value={values.subject} onChange={(ev) => set("subject", ev.target.value)} onFocus={() => setFocus("subject")} maxLength={200} {...err("subject")} />
        </Field>
        <Field label="Heading" htmlFor="t-heading" required error={e.heading}>
          <Input ref={refs.heading} id="t-heading" name="heading" value={values.heading} onChange={(ev) => set("heading", ev.target.value)} onFocus={() => setFocus("heading")} maxLength={200} {...err("heading")} />
        </Field>
        <Field label="Message" htmlFor="t-body" required error={e.body} hint="Leave an empty line between paragraphs. Start a line with - for a list.">
          <Textarea ref={refs.body} id="t-body" name="body" rows={10} value={values.body} onChange={(ev) => set("body", ev.target.value)} onFocus={() => setFocus("body")} maxLength={10000}
            aria-invalid={!!e.body || undefined} aria-describedby={e.body ? "t-body-error" : "t-body-hint"} />
        </Field>
        {def.hasButton && (
          <Field label="Button text" htmlFor="t-button" hint="Leave empty for no button (the link still appears in the text if you use {{link}})." error={e.buttonLabel}>
            <Input ref={refs.buttonLabel} id="t-button" name="buttonLabel" value={values.buttonLabel} onChange={(ev) => set("buttonLabel", ev.target.value)} onFocus={() => setFocus("buttonLabel")} maxLength={60}
              aria-describedby="t-button-hint" />
          </Field>
        )}
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-800">Insert a detail</p>
          <p className="mb-2 text-xs text-slate-500">Click to add it where your cursor is. It's replaced with the real value for each person.</p>
          <div className="flex flex-wrap gap-2">
            {def.variables.map((v) => (
              <button key={v.name} type="button" onClick={() => insert(v.name)} title={v.description}
                className={cn("inline-flex min-h-9 items-center rounded-full border border-slate-300 bg-white px-3 font-mono text-xs text-slate-700 hover:border-brand-400 hover:bg-brand-50", focusRing)}>
                {`{{${v.name}}}`}<span className="sr-only">: {v.description}</span>
              </button>
            ))}
          </div>
          {def.highlight && <p className="mt-2 text-xs text-slate-500">The {def.highlight.label.toLowerCase()} is always shown in a box under your message.</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:flex-wrap sm:justify-end">
          {emailOn && (
            <SubmitButton variant="ghost" name="intent" value="test" pending={testing} pendingText="Sending…">
              <Send className="size-4" aria-hidden />Send test to me
            </SubmitButton>
          )}
          <SubmitButton variant="secondary" name="intent" value="draft" pending={saving && last === "save"} pendingText="Saving…">
            <Save className="size-4" aria-hidden />Save draft
          </SubmitButton>
          <SubmitButton name="intent" value="use" pending={saving && last === "save"} pendingText="Saving…">
            <Check className="size-4" aria-hidden />Save and use
          </SubmitButton>
        </div>
      </div>

      <section aria-labelledby="preview-title" className="min-w-0">
        <h2 id="preview-title" className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><Eye className="size-4" aria-hidden />Preview with sample details</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <p className="truncate border-b border-slate-100 px-4 py-2.5 text-sm"><span className="text-slate-500">Subject: </span><span className="font-medium text-slate-900">{preview.subject}</span></p>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[36rem] w-full bg-slate-100" />
        </div>
      </section>
    </form>
  );
}
