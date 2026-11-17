"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { FormState } from "@/app/actions";

/**
 * Runs a server action from a form's onSubmit instead of `<form action>`.
 * React 19 resets every uncontrolled field after a `<form action>` finishes, which erases what
 * the user typed whenever the server answers with a validation error. This keeps the values.
 */
export function useFormAction(action: (state: FormState, data: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const data = formDataWithSubmitter(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  }
  return { state, pending, onSubmit };
}

/** FormData including the clicked submit button's name/value (older browsers: without it). */
export function formDataWithSubmitter(form: HTMLFormElement, submitter: Element | null) {
  try {
    return new FormData(form, submitter as HTMLElement | null);
  } catch {
    return new FormData(form);
  }
}
