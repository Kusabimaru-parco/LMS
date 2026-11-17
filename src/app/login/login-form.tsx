"use client";

import Link from "next/link";
import { useFormAction } from "@/components/use-form-action";
import { login } from "../actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm({ next }: { next?: string }) {
  const { state, pending, onSubmit } = useFormAction(login);
  const e = state?.errors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
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
      <div className="relative">
        <Link href="/forgot-password" className="absolute right-0 top-0 text-sm font-medium text-brand-700 hover:underline">Forgot password?</Link>
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
      </div>
      <SubmitButton pending={pending} className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
