"use client";

import { useActionState } from "react";
import { login } from "../actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && <Alert tone="danger">{state.message}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email" error={e.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@school.edu"
          required
          aria-invalid={!!e.email}
          aria-describedby={e.email ? "email-error" : undefined}
        />
      </Field>
      <Field label="Password" htmlFor="password" error={e.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!e.password}
          aria-describedby={e.password ? "password-error" : undefined}
        />
      </Field>
      <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-xs text-slate-500">Forgot your password? Ask your school administrator to reset it.</p>
    </form>
  );
}
