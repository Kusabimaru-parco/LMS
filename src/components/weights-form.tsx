"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions";
import { CATEGORIES_CLIENT } from "./weights-categories";
import { Alert, Field, Input } from "./ui";
import { SubmitButton } from "./submit-button";
import { useFormAction } from "./use-form-action";
import { cn } from "@/lib/utils";

/**
 * Choose how averages are calculated: every point the same, or weighted by category.
 * `inherit` adds a "use the school default" option (course settings).
 */
export function WeightsForm({
  action,
  initial,
  inherit,
  schoolLabel,
  initialMode,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  initial: Record<string, number> | null;
  inherit?: boolean;
  schoolLabel?: string;
  initialMode?: "inherit" | "points" | "weighted";
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const [mode, setMode] = useState<"inherit" | "points" | "weighted">(initialMode ?? (initial ? "weighted" : inherit ? "inherit" : "points"));
  const [w, setW] = useState<Record<string, string>>(Object.fromEntries(CATEGORIES_CLIENT.map((c) => [c.id, String(initial?.[c.id] ?? (c.id === "assignment" ? 40 : 30))])));
  const total = CATEGORIES_CLIENT.reduce((s, c) => s + (Number(w[c.id]) || 0), 0);
  const e = state?.errors ?? {};
  type Mode = "inherit" | "points" | "weighted";
  const options: { id: Mode; label: string; hint: string }[] = [
    ...(inherit ? [{ id: "inherit" as Mode, label: "Use the school default", hint: schoolLabel ?? "" }] : []),
    { id: "points", label: "Every point counts the same", hint: "Total points earned ÷ total points possible." },
    { id: "weighted", label: "Weighted by category", hint: "e.g. assignments 40%, quizzes 30%, exams 30%." },
  ];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <input type="hidden" name="mode" value={mode} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">How averages are calculated</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((o) => (
            <label key={o.id} className={cn("flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-brand-500",
              mode === o.id ? "border-brand-600 bg-brand-50" : "border-slate-300 bg-white hover:bg-slate-50")}>
              <input type="radio" name="modePick" checked={mode === o.id} onChange={() => setMode(o.id)} className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="block text-sm font-medium text-slate-900">{o.label}</span>
                {o.hint && <span className="block text-xs text-slate-500">{o.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "weighted" && (
        <div>
          <div className="grid gap-4 sm:grid-cols-3">
            {CATEGORIES_CLIENT.map((c) => (
              <Field key={c.id} label={`${c.label} (%)`} htmlFor={`w_${c.id}`} error={e[`w_${c.id}`]}>
                <Input id={`w_${c.id}`} name={`w_${c.id}`} type="number" min={0} max={100} inputMode="numeric" value={w[c.id]}
                  onChange={(ev) => setW((cur) => ({ ...cur, [c.id]: ev.target.value }))} aria-invalid={!!e[`w_${c.id}`] || undefined} />
              </Field>
            ))}
          </div>
          <p className={cn("mt-2 text-sm", total === 100 ? "text-emerald-700" : "text-amber-700")} role="status">
            Total {total}%{total !== 100 && " — weights are scaled to 100%, but most schools make them add up to 100."}
          </p>
          <p className="mt-1 text-xs text-slate-500">Categories with no grades yet are left out until they have some.</p>
        </div>
      )}
      <div className="flex justify-end"><SubmitButton pending={pending}>Save</SubmitButton></div>
    </form>
  );
}
