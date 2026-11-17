import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { canAccessCourse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACCEPT, MAX_UPLOAD_MB } from "@/lib/storage";
import { deleteMaterial, deleteModule, moveModule, toggleModuleComplete, updateModule } from "@/app/actions";
import { ButtonLink, Card, CardHeader, EmptyState, focusRing } from "@/components/ui";
import { LessonContent } from "@/components/lms";
import { ActivityList, activityCount, activityInclude } from "@/components/course-outline";
import { MaterialCard } from "@/components/materials";
import { MaterialForm } from "@/components/material-form";
import { SimpleForm } from "@/components/simple-form";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";

type P = { params: Promise<{ id: string; mid: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { mid } = await params;
  const m = await db.module.findUnique({ where: { id: mid }, select: { title: true } });
  return { title: m?.title ?? "Module" };
}

const iconBtn = cn("flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40", focusRing);

export default async function ModulePage({ params }: P) {
  const { id, mid } = await params;
  const user = await requireUser();
  const access = await canAccessCourse(user, id);
  if (!access.canView) notFound();
  const { canManage } = access;
  const isStudent = user.role === "STUDENT";

  const [m, siblings, course] = await Promise.all([
    db.module.findFirst({
      where: { id: mid, courseId: id },
      include: {
        ...activityInclude(user.id, isStudent),
        materials: { orderBy: { position: "asc" }, include: { file: { select: { id: true, name: true, size: true, mime: true } } } },
        completions: { where: { userId: user.id }, select: { userId: true } },
      },
    }),
    db.module.findMany({ where: { courseId: id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true } }),
    db.course.findUnique({ where: { id }, select: { title: true } }),
  ]);
  if (!m || !course) notFound();
  const idx = siblings.findIndex((s) => s.id === mid);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  const done = m.completions.length > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/courses" className="hover:text-slate-900 hover:underline">Courses</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li><Link href={`/courses/${id}`} className="hover:text-slate-900 hover:underline">{course.title}</Link></li>
          <li aria-hidden><ChevronRight className="size-4" /></li>
          <li aria-current="page" className="font-medium text-slate-700">Module {idx + 1}</li>
        </ol>
      </nav>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-700">Module {idx + 1} of {siblings.length}</p>
          <h1 className="mt-1 font-display text-[1.75rem] font-semibold leading-tight text-slate-900 sm:text-[2.125rem]">{m.title}</h1>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <form action={moveModule.bind(null, mid, "up")}>
              <button type="submit" disabled={idx === 0} aria-label="Move module up" title="Move up" className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
            </form>
            <form action={moveModule.bind(null, mid, "down")}>
              <button type="submit" disabled={idx === siblings.length - 1} aria-label="Move module down" title="Move down" className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
            </form>
            <form action={deleteModule.bind(null, mid)}>
              <ConfirmButton message="Delete this module and its materials? Lessons, assignments and quizzes in it are kept and move to General." aria-label="Delete module" title="Delete module"
                className={cn(iconBtn, "hover:bg-rose-50 hover:text-rose-600")}>
                <Trash2 className="size-4" aria-hidden />
              </ConfirmButton>
            </form>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {(m.description || canManage) && (
          <Card>
            <CardHeader title="Activities and instructions" />
            <div className="px-5 py-4 text-base">
              {m.description ? <LessonContent text={m.description} /> : <p className="text-sm text-slate-500">No instructions yet. Use Edit module to add them.</p>}
            </div>
            {canManage && (
              <details className="border-t border-slate-100">
                <summary className={cn("flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 text-sm font-medium text-brand-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden", focusRing)}>
                  <Pencil className="size-4" aria-hidden />Edit module
                </summary>
                <div className="px-5 pb-5">
                  <SimpleForm
                    action={updateModule.bind(null, mid)}
                    submitLabel="Save module"
                    fields={[
                      { name: "title", label: "Module title", required: true, defaultValue: m.title },
                      { name: "description", label: "Activities and instructions", type: "textarea", rows: 8, defaultValue: m.description, hint: "Start a line with ## for a heading or - for a list item." },
                    ]}
                  />
                </div>
              </details>
            )}
          </Card>
        )}

        <section aria-labelledby="materials-title" className="space-y-3">
          <h2 id="materials-title" className="text-lg font-semibold text-slate-900">Materials</h2>
          {m.materials.length === 0 && !canManage && <p className="text-sm text-slate-500">No materials in this module.</p>}
          {m.materials.map((mat, i) => (
            <div key={mat.id} id={`material-${mat.id}`} className="scroll-mt-20">
              <MaterialCard m={mat} open={i === 0} deleteAction={canManage ? deleteMaterial.bind(null, mat.id) : undefined} />
            </div>
          ))}
          {canManage && (
            <Card>
              <CardHeader title="Add material" description="Upload a PDF or slides, or link to Google Slides, Drive, OneDrive or YouTube." />
              <div className="p-5"><MaterialForm courseId={id} moduleId={mid} maxMb={MAX_UPLOAD_MB} accept={ACCEPT} /></div>
            </Card>
          )}
        </section>

        <Card>
          <CardHeader
            title="Lessons, assignments and quizzes"
            action={canManage && (
              <div className="flex flex-wrap justify-end gap-1">
                <Link href={`/courses/${id}/lessons/new?module=${mid}`} className={cn("inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}><Plus className="size-4" aria-hidden />Lesson</Link>
                <Link href={`/courses/${id}/assignments/new?module=${mid}`} className={cn("inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}><Plus className="size-4" aria-hidden />Assignment</Link>
                <Link href={`/courses/${id}/quizzes/new?module=${mid}`} className={cn("inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}><Plus className="size-4" aria-hidden />Quiz</Link>
                <Link href={`/courses/${id}/quizzes/new?kind=EXAM&module=${mid}`} className={cn("inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}><Plus className="size-4" aria-hidden />Exam</Link>
              </div>
            )}
          />
          {activityCount(m) > 0 ? (
            <ActivityList data={m} courseId={id} isStudent={isStudent} />
          ) : (
            <EmptyState icon={Layers} title="Nothing to do here yet">{canManage ? "Add a lesson, assignment, quiz or exam to this module." : "Read the materials above."}</EmptyState>
          )}
        </Card>

        {isStudent && (
          <form action={toggleModuleComplete.bind(null, id, mid)} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-slate-700">
              {done ? <><CheckCircle2 className="size-5 text-emerald-600" aria-hidden /> You've finished this module.</> : "Finished everything in this module? Mark it done to track your progress."}
            </p>
            <SubmitButton variant={done ? "secondary" : "primary"} pendingText="Saving…">{done ? "Mark as not done" : "Mark module done"}</SubmitButton>
          </form>
        )}
      </div>

      <nav aria-label="Module navigation" className="mt-6 grid grid-cols-2 gap-3">
        {prev ? (
          <ButtonLink href={`/courses/${id}/modules/${prev.id}`} variant="secondary" className="justify-start">
            <ArrowLeft className="size-4 shrink-0" aria-hidden /><span className="truncate">Previous module</span>
          </ButtonLink>
        ) : <span />}
        {next ? (
          <ButtonLink href={`/courses/${id}/modules/${next.id}`} variant="secondary" className="justify-end">
            <span className="truncate">Next module</span><ArrowRight className="size-4 shrink-0" aria-hidden />
          </ButtonLink>
        ) : (
          <ButtonLink href={`/courses/${id}`} variant="secondary" className="justify-end">Back to course</ButtonLink>
        )}
      </nav>
    </div>
  );
}
