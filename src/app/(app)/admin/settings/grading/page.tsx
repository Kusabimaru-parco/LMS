import type { Metadata } from "next";
import { CalendarRange, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseWeights } from "@/lib/grading";
import { addGradingPeriod, deleteGradingPeriod, saveGradeWeights } from "@/app/admin-actions";
import { Card, CardHeader, EmptyState, PageHeader, focusRing } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { SimpleForm } from "@/components/simple-form";
import { WeightsForm } from "@/components/weights-form";
import { ConfirmButton } from "@/components/confirm-button";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Grading settings" };

export default async function GradingSettingsPage() {
  const admin = await requireUser(["ADMIN"]);
  const periods = await db.gradingPeriod.findMany({ where: { schoolId: admin.schoolId }, orderBy: { startsAt: "asc" } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="School settings" description="How averages are calculated, and the terms used for report cards." />
      <SettingsTabs current="/admin/settings/grading" />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Grade weights" description="The default for every course. Teachers can choose different weights for their own course." />
          <div className="p-5"><WeightsForm action={saveGradeWeights} initial={parseWeights(admin.school.gradeWeights) as Record<string, number> | null} /></div>
        </Card>

        <Card>
          <CardHeader title="Grading periods" description="Terms, quarters or semesters. Report cards can show one period or the whole year." />
          {periods.length ? (
            <ul className="divide-y divide-slate-100">
              {periods.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <CalendarRange className="size-5 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500">{formatDate(p.startsAt)} – {formatDate(p.endsAt)}</span>
                  </span>
                  <form action={deleteGradingPeriod.bind(null, p.id)}>
                    <ConfirmButton message={`Delete ${p.name}? Grades are not affected.`} aria-label={`Delete ${p.name}`}
                      className={cn("flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600", focusRing)}>
                      <Trash2 className="size-4" aria-hidden />
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarRange} title="No grading periods yet">Add your terms below. Until then, report cards cover the whole year.</EmptyState>
          )}
          <div className="border-t border-slate-100 p-5">
            <SimpleForm
              action={addGradingPeriod}
              resetOnSuccess
              submitLabel="Add period"
              pendingLabel="Adding…"
              fields={[
                { name: "name", label: "Name", required: true, placeholder: "e.g. Quarter 1" },
                { name: "startsAt", label: "Starts", type: "date", required: true, half: true },
                { name: "endsAt", label: "Ends", type: "date", required: true, half: true },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
