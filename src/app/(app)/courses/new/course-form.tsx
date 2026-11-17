"use client";

import { useFormAction } from "@/components/use-form-action";
import { createCourse } from "@/app/actions";
import { Alert, ButtonLink, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { COURSE_COLORS, cn } from "@/lib/utils";

export function CourseForm({ teachers, isAdmin }: { teachers: { id: string; name: string }[]; isAdmin: boolean }) {
  const { state, pending, onSubmit } = useFormAction(createCourse);
  const e = state?.errors ?? {};
  const err = (k: string) => ({ "aria-invalid": !!e[k], "aria-describedby": e[k] ? `${k}-error` : undefined });

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-5 p-5 sm:p-6" noValidate>
        {state?.message && <Alert tone="danger">{state.message}</Alert>}
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="Course title" htmlFor="title" error={e.title} required>
              <Input id="title" name="title" placeholder="e.g. Algebra II" required {...err("title")} />
            </Field>
          </div>
          <Field label="Course code" htmlFor="code" error={e.code} required>
            <Input id="code" name="code" placeholder="MATH-10" required {...err("code")} />
          </Field>
        </div>
        <Field label="Description" htmlFor="description" hint="A sentence or two so students know what to expect.">
          <Textarea id="description" name="description" rows={3} />
        </Field>
        {isAdmin && (
          <Field label="Teacher" htmlFor="teacherId">
            <Select id="teacherId" name="teacherId" defaultValue="">
              <option value="">Assign later</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-800">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(COURSE_COLORS).map(([name, c], i) => (
              <label key={name} className="relative cursor-pointer">
                <input type="radio" name="color" value={name} defaultChecked={i === 0} className="peer sr-only" />
                <span className="sr-only">{name}</span>
                <span
                  aria-hidden
                  className={cn(
                    "block size-9 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500",
                    c.bg,
                  )}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <ButtonLink href="/courses" variant="secondary">Cancel</ButtonLink>
          <SubmitButton pending={pending} pendingText="Creating…">Create course</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
