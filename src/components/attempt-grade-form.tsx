"use client";

import type { ReactNode } from "react";
import { useFormAction } from "./use-form-action";
import type { FormState } from "@/app/actions";
import { Alert, Field, Textarea } from "./ui";
import { SubmitButton } from "./submit-button";

/** Wraps the server-rendered attempt review so teachers can give points and feedback in one save. */
export function AttemptGradeForm({
  action,
  feedback,
  children,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  feedback: string;
  children: ReactNode;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {children}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
        <Field label="Feedback for the student" htmlFor="feedback" hint="Optional. Shown with their results.">
          <Textarea id="feedback" name="feedback" rows={3} defaultValue={feedback} aria-describedby="feedback-hint" />
        </Field>
        <div className="flex justify-end"><SubmitButton pending={pending} pendingText="Saving…">Save grades</SubmitButton></div>
      </div>
    </form>
  );
}
