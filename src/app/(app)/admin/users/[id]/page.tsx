import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileBadge, Mail, Phone, Trash2, UserMinus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteUser, resetUserPassword } from "@/app/actions";
import { linkChild, unlinkChild, updateUser } from "@/app/admin-actions";
import { Avatar, Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, focusRing } from "@/components/ui";
import { CourseDot } from "@/components/lms";
import { SimpleForm } from "@/components/simple-form";
import { ConfirmButton } from "@/components/confirm-button";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { avatarUrl, cn, ROLE_LABEL, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Person" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser(["ADMIN"]);
  const { id } = await params;
  const u = await db.user.findFirst({
    where: { id, schoolId: admin.schoolId },
    include: {
      enrollments: { include: { course: { select: { id: true, title: true, color: true } } } },
      coursesTaught: { select: { id: true, title: true, color: true } },
      children: { include: { student: { select: { id: true, name: true, email: true, gradeLevel: true, avatarUpdatedAt: true } } } },
      parents: { include: { parent: { select: { id: true, name: true, email: true, phone: true, avatarUpdatedAt: true } } } },
    },
  });
  if (!u) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ChevronLeft className="size-4" aria-hidden />People
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={u.name} size="xl" src={avatarUrl(u)} />
        <div className="min-w-0 flex-1">
          <PageHeader title={u.name} description={<>{ROLE_LABEL[u.role]}{u.gradeLevel ? ` · ${u.gradeLevel}` : ""} · {u.lastSeenAt ? `active ${timeAgo(u.lastSeenAt)}` : u.mustChangePassword ? "hasn't signed in yet" : "not active recently"}</>} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <div className="p-5">
              <SimpleForm
                action={updateUser.bind(null, u.id)}
                submitLabel="Save changes"
                fields={[
                  { name: "name", label: "Full name", required: true, defaultValue: u.name, half: true },
                  { name: "email", label: "Email", type: "email", required: true, defaultValue: u.email, half: true },
                  { name: "role", label: "Role", type: "select", defaultValue: u.role, half: true, options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })) },
                  { name: "gradeLevel", label: "Grade level", defaultValue: u.gradeLevel ?? "", half: true, hint: "Students only." },
                ]}
              />
            </div>
          </Card>

          {u.role === "PARENT" && (
            <Card>
              <CardHeader title="Children" description="This parent sees these students' grades, attendance and report cards, and gets a weekly email." />
              {u.children.length ? (
                <ul className="divide-y divide-slate-100">
                  {u.children.map(({ student: s }) => (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
                      <Link href={`/admin/users/${s.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline">{s.name}</Link>
                      <span className="hidden text-xs text-slate-500 sm:inline">{s.email}</span>
                      <form action={unlinkChild.bind(null, u.id, s.id)}>
                        <ConfirmButton message={`Unlink ${s.name} from ${u.name}?`} aria-label={`Unlink ${s.name}`}
                          className={cn("flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600", focusRing)}>
                          <UserMinus className="size-4" aria-hidden />
                        </ConfirmButton>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={UserMinus} title="No children linked yet">Add a child by their school email below.</EmptyState>
              )}
              <div className="border-t border-slate-100 p-5">
                <SimpleForm action={linkChild.bind(null, u.id)} resetOnSuccess submitLabel="Link child"
                  fields={[{ name: "childEmail", label: "Child's school email", type: "email", required: true, placeholder: "student@school.edu" }]} />
              </div>
            </Card>
          )}

          {u.role === "STUDENT" && (
            <Card>
              <CardHeader title="Parents and guardians" />
              {u.parents.length ? (
                <ul className="divide-y divide-slate-100">
                  {u.parents.map(({ parent: p }) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                      <Avatar name={p.name} size="sm" src={avatarUrl(p)} />
                      <Link href={`/admin/users/${p.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline">{p.name}</Link>
                      <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><Mail className="size-4" aria-hidden />{p.email}</a>
                      {p.phone && <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><Phone className="size-4" aria-hidden />{p.phone}</a>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-slate-500">No parent account linked. Add a parent on the People page and enter this student's email.</p>
              )}
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <div className="space-y-2 p-5 text-sm">
              <a href={`mailto:${u.email}`} className="flex items-center gap-2 text-brand-700 hover:underline"><Mail className="size-4" aria-hidden />{u.email}</a>
              {u.phone && <a href={`tel:${u.phone}`} className="flex items-center gap-2 text-brand-700 hover:underline"><Phone className="size-4" aria-hidden />{u.phone}</a>}
              {u.bio && <p className="pt-2 text-slate-600">{u.bio}</p>}
            </div>
          </Card>
          {(u.enrollments.length > 0 || u.coursesTaught.length > 0) && (
            <Card>
              <CardHeader title={u.role === "TEACHER" ? "Teaches" : "Classes"} />
              <ul className="divide-y divide-slate-100">
                {[...u.coursesTaught, ...u.enrollments.map((e) => e.course)].map((c) => (
                  <li key={c.id}><Link href={`/courses/${c.id}`} className="flex items-center gap-2 px-5 py-2.5 text-sm text-slate-800 hover:bg-slate-50"><CourseDot color={c.color} />{c.title}</Link></li>
                ))}
              </ul>
            </Card>
          )}
          {u.role === "STUDENT" && (
            <ButtonLink href={`/report-cards/${u.id}`} variant="secondary" className="w-full"><FileBadge className="size-4" aria-hidden />Report card</ButtonLink>
          )}
          {u.id !== admin.id && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <ResetPasswordButton name={u.name} action={resetUserPassword.bind(null, u.id)} />
                <span className="text-sm text-slate-600">Reset password</span>
              </div>
              <form action={deleteUser.bind(null, u.id)} className="mt-3 border-t border-slate-100 pt-3">
                <ConfirmButton message={`Remove ${u.name}? Their work and progress will be deleted. This can't be undone.`}
                  className={cn("inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-rose-700 hover:bg-rose-50", focusRing)}>
                  <Trash2 className="size-4" aria-hidden />Remove {u.name}
                </ConfirmButton>
              </form>
            </Card>
          )}
          {u.mustChangePassword && <Badge tone="warning">Still using a temporary password</Badge>}
        </div>
      </div>
    </div>
  );
}
