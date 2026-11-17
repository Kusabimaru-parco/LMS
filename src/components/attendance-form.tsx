"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import type { FormState } from "@/app/actions";
import { Alert, Avatar, Button, Input } from "./ui";
import { SubmitButton } from "./submit-button";
import { useFormAction } from "./use-form-action";
import { cn } from "@/lib/utils";

const STATUSES = [
  { id: "PRESENT", label: "Present", short: "P", on: "border-emerald-600 bg-emerald-600 text-white" },
  { id: "LATE", label: "Late", short: "L", on: "border-amber-500 bg-amber-500 text-white" },
  { id: "ABSENT", label: "Absent", short: "A", on: "border-rose-600 bg-rose-600 text-white" },
  { id: "EXCUSED", label: "Excused", short: "E", on: "border-slate-600 bg-slate-600 text-white" },
];

type Student = { id: string; name: string; avatar: string | null; status: string | null; note: string; summary: string };

export function AttendanceForm({ action, date, today, students, courseId }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  date: string;
  today: string;
  students: Student[];
  courseId: string;
}) {
  const router = useRouter();
  const { state, pending, onSubmit } = useFormAction(action);
  const [status, setStatus] = useState<Record<string, string>>(Object.fromEntries(students.map((s) => [s.id, s.status ?? ""])));
  const marked = Object.values(status).filter(Boolean).length;
  const counts = Object.fromEntries(STATUSES.map((st) => [st.id, Object.values(status).filter((v) => v === st.id).length]));
  const taken = students.some((s) => s.status);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="date" value={date} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="att-date" className="mb-1.5 block text-sm font-medium text-slate-800">Date</label>
          <Input id="att-date" type="date" value={date} max={today} className="w-auto"
            onChange={(e) => e.target.value && router.push(`/courses/${courseId}?tab=attendance&date=${e.target.value}`)} />
        </div>
        <Button type="button" variant="secondary" onClick={() => setStatus(Object.fromEntries(students.map((s) => [s.id, status[s.id] || "PRESENT"])))}>
          <CheckCheck className="size-4" aria-hidden />Mark the rest present
        </Button>
        <p className="text-sm text-slate-600" aria-live="polite">
          {marked}/{students.length} marked{counts.ABSENT ? ` · ${counts.ABSENT} absent` : ""}{counts.LATE ? ` · ${counts.LATE} late` : ""}
          {taken && <span className="ml-1 text-emerald-700">· saved earlier</span>}
        </p>
      </div>
      {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {students.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={s.name} size="sm" src={s.avatar} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{s.name}</span>
                <span className="block truncate text-xs text-slate-500">{s.summary}</span>
              </span>
            </div>
            <fieldset className="flex shrink-0 gap-1.5">
              <legend className="sr-only">Attendance for {s.name}</legend>
              {STATUSES.map((st) => (
                <label key={st.id} title={st.label}
                  className={cn("flex size-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-1 md:size-10",
                    status[s.id] === st.id ? st.on : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")}>
                  <input type="radio" name={`s_${s.id}`} value={st.id} checked={status[s.id] === st.id} onChange={() => setStatus((c) => ({ ...c, [s.id]: st.id }))} className="sr-only" />
                  <span aria-hidden>{st.short}</span><span className="sr-only">{st.label}</span>
                </label>
              ))}
            </fieldset>
            <label className="sr-only" htmlFor={`n_${s.id}`}>Note for {s.name}</label>
            <Input id={`n_${s.id}`} name={`n_${s.id}`} defaultValue={s.note} placeholder="Note (optional)" maxLength={200} className="md:w-48" />
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">P = present, L = late, A = absent, E = excused. Unmarked students are not saved.</p>
      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
        <SubmitButton pending={pending} pendingText="Saving…" className="shadow-lg">Save attendance</SubmitButton>
      </div>
    </form>
  );
}
