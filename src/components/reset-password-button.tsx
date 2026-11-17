"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import type { FormState } from "@/app/actions";
import { CopyValue } from "./copy-value";
import { focusRing } from "./ui";
import { cn } from "@/lib/utils";

/** Admin "reset password" for one person. Shows the temporary password when it couldn't be emailed. */
export function ResetPasswordButton({ name, action }: { name: string; action: (s: FormState) => Promise<FormState> }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <>
      <form action={run}>
        <button
          type="submit"
          disabled={pending}
          onClick={(e) => { if (!confirm(`Reset ${name}'s password? They'll get a temporary password and must choose a new one when they sign in.`)) e.preventDefault(); }}
          aria-label={`Reset password for ${name}`}
          title="Reset password"
          className={cn("flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900", focusRing)}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
        </button>
      </form>
      {state?.message && (
        <div role="status" className={cn("basis-full rounded-lg border px-3 py-2 text-sm", state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-800")}>
          {state.message}
          {state.code && <CopyValue value={state.code} className="mt-2" />}
        </div>
      )}
    </>
  );
}
