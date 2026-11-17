"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import type { FormState, RubricCriterion } from "@/app/actions";
import { Alert, Button, Field, Input, Textarea, focusRing } from "./ui";
import { SubmitButton } from "./submit-button";
import { useFormAction } from "./use-form-action";
import { cn } from "@/lib/utils";

const uid = () => Math.random().toString(36).slice(2, 10);
const newCriterion = (): RubricCriterion => ({
  id: uid(),
  title: "",
  levels: [
    { id: uid(), label: "Excellent", points: 4, description: "" },
    { id: uid(), label: "Good", points: 3, description: "" },
    { id: uid(), label: "Developing", points: 2, description: "" },
    { id: uid(), label: "Beginning", points: 1, description: "" },
  ],
});

/** Teachers build or change an assignment's rubric. */
export function RubricEditor({ initial, save }: { initial: RubricCriterion[]; save: (payload: string) => Promise<{ ok: boolean; message: string }> }) {
  const router = useRouter();
  const [rows, setRows] = useState<RubricCriterion[]>(initial.length ? initial : []);
  const [open, setOpen] = useState(initial.length > 0);
  const [msg, setMsg] = useState<{ ok: boolean; message: string }>();
  const [pending, start] = useTransition();
  const max = rows.reduce((s, c) => s + Math.max(0, ...c.levels.map((l) => Number(l.points) || 0)), 0);
  const update = (i: number, patch: Partial<RubricCriterion>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  function submit(list: RubricCriterion[]) {
    start(async () => {
      const r = await save(JSON.stringify(list));
      setMsg(r);
      if (r.ok) router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="p-5">
        <p className="mb-3 text-sm text-slate-600">A rubric shows students how their work is judged, and lets you grade by clicking a level for each criterion.</p>
        <Button type="button" variant="secondary" onClick={() => { setRows([newCriterion()]); setOpen(true); }}><Plus className="size-4" aria-hidden />Add a rubric</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.message}</Alert>}
      {rows.map((c, i) => (
        <fieldset key={c.id} className="rounded-xl border border-slate-200 p-4">
          <legend className="sr-only">Criterion {i + 1}</legend>
          <div className="mb-3 flex items-end gap-2">
            <div className="flex-1">
              <Field label={`Criterion ${i + 1}`} htmlFor={`rc-${c.id}`}>
                <Input id={`rc-${c.id}`} value={c.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="e.g. Ideas and content" />
              </Field>
            </div>
            <button type="button" aria-label={`Remove criterion ${i + 1}`} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:size-10", focusRing)}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {c.levels.map((l, li) => (
              <div key={l.id} className="space-y-2 rounded-lg bg-slate-50 p-3">
                <div className="flex gap-2">
                  <Input aria-label={`Level ${li + 1} name`} value={l.label} onChange={(e) => update(i, { levels: c.levels.map((x, xi) => (xi === li ? { ...x, label: e.target.value } : x)) })} />
                  <Input aria-label={`Level ${li + 1} points`} type="number" min={0} max={1000} value={l.points} className="w-20"
                    onChange={(e) => update(i, { levels: c.levels.map((x, xi) => (xi === li ? { ...x, points: Number(e.target.value) } : x)) })} />
                </div>
                <Textarea aria-label={`Level ${li + 1} description`} rows={2} value={l.description} placeholder="What does this look like?" className="text-sm"
                  onChange={(e) => update(i, { levels: c.levels.map((x, xi) => (xi === li ? { ...x, description: e.target.value } : x)) })} />
                {c.levels.length > 2 && (
                  <button type="button" onClick={() => update(i, { levels: c.levels.filter((_, xi) => xi !== li) })} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600">
                    <X className="size-3" aria-hidden />Remove level
                  </button>
                )}
              </div>
            ))}
          </div>
          {c.levels.length < 8 && (
            <button type="button" onClick={() => update(i, { levels: [...c.levels, { id: uid(), label: "", points: 0, description: "" }] })}
              className={cn("mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}>
              <Plus className="size-4" aria-hidden />Add level
            </button>
          )}
        </fieldset>
      ))}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={() => setRows((r) => [...r, newCriterion()])}><Plus className="size-4" aria-hidden />Add criterion</Button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Out of {max} points</span>
          {initial.length > 0 && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => { if (confirm("Remove the rubric? Grades already given are kept.")) { setRows([]); setOpen(false); submit([]); } }}>Remove rubric</Button>
          )}
          <Button type="button" disabled={pending} onClick={() => submit(rows)}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden />}Save rubric</Button>
        </div>
      </div>
    </div>
  );
}

/** Grade a submission by choosing one level per criterion. */
export function RubricGrader({ rubric, scores, feedback, action }: {
  rubric: RubricCriterion[];
  scores: Record<string, string>;
  feedback: string;
  action: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const [picked, setPicked] = useState<Record<string, string>>(scores);
  const total = rubric.reduce((s, c) => s + (c.levels.find((l) => l.id === picked[c.id])?.points ?? 0), 0);
  const max = rubric.reduce((s, c) => s + Math.max(...c.levels.map((l) => l.points)), 0);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      {rubric.map((c) => (
        <fieldset key={c.id} aria-invalid={!!state?.errors?.[`r_${c.id}`] || undefined}>
          <legend className="mb-2 text-sm font-semibold text-slate-900">{c.title}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {c.levels.map((l) => (
              <label key={l.id} className={cn("cursor-pointer rounded-lg border p-3 text-sm focus-within:ring-2 focus-within:ring-brand-500",
                picked[c.id] === l.id ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50")}>
                <input type="radio" name={`r_${c.id}`} value={l.id} checked={picked[c.id] === l.id} onChange={() => setPicked((p) => ({ ...p, [c.id]: l.id }))} className="sr-only" />
                <span className="flex items-baseline justify-between gap-2"><span className="font-medium text-slate-900">{l.label}</span><span className="text-xs text-slate-500">{l.points} pts</span></span>
                {l.description && <span className="mt-1 block text-xs text-slate-600">{l.description}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-sm font-medium text-slate-900" aria-live="polite">Score: {total} / {max}</p>
      <Field label="Feedback for the student" htmlFor="rb-feedback">
        <Textarea id="rb-feedback" name="feedback" rows={4} defaultValue={feedback} placeholder="What went well, and one thing to improve." />
      </Field>
      <div className="flex justify-end"><SubmitButton pending={pending}>Save grade</SubmitButton></div>
    </form>
  );
}
