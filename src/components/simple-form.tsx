"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";
import { Alert, Field, Input, Select, Textarea } from "./ui";
import { SubmitButton } from "./submit-button";
import { cn } from "@/lib/utils";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "datetime-local" | "textarea" | "select" | "color";
  required?: boolean;
  hint?: string;
  placeholder?: string;
  rows?: number;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  half?: boolean;
  autoComplete?: string;
};

/** Config-driven form with inline errors, success message and pending state. */
export function SimpleForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
  resetOnSuccess,
  className,
  footer,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  fields: FieldDef[];
  submitLabel: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const e = state?.errors ?? {};

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={cn("space-y-5", className)} noValidate>
      {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `f-${f.name}`;
          const common = {
            id,
            name: f.name,
            required: f.required,
            placeholder: f.placeholder,
            defaultValue: f.defaultValue,
            "aria-invalid": !!e[f.name],
            "aria-describedby": e[f.name] ? `${id}-error` : f.hint ? `${id}-hint` : undefined,
          };
          return (
            <div key={f.name} className={f.half ? "" : "sm:col-span-2"}>
              <Field label={f.label} htmlFor={id} hint={f.hint} error={e[f.name]} required={f.required}>
                {f.type === "textarea" ? (
                  <Textarea rows={f.rows ?? 5} {...common} />
                ) : f.type === "select" ? (
                  <Select {...common}>
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                ) : f.type === "color" ? (
                  <Input type="color" className="h-11 w-24 cursor-pointer p-1" {...common} />
                ) : (
                  <Input type={f.type ?? "text"} min={f.min} max={f.max} autoComplete={f.autoComplete} {...common} />
                )}
              </Field>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {footer}
        <SubmitButton pendingText={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
