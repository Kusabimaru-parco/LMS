import type { Metadata } from "next";
import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createUser, deleteUser } from "@/app/actions";
import { Avatar, Badge, Card, CardHeader, Input, PageHeader, focusRing } from "@/components/ui";
import { SimpleForm } from "@/components/simple-form";
import { ConfirmButton } from "@/components/confirm-button";
import { cn, ROLE_LABEL } from "@/lib/utils";

export const metadata: Metadata = { title: "People" };

const FILTERS = [
  { id: "", label: "Everyone" },
  { id: "STUDENT", label: "Students" },
  { id: "TEACHER", label: "Teachers" },
  { id: "ADMIN", label: "Admins" },
];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string }> }) {
  const admin = await requireUser(["ADMIN"]);
  const { role = "", q = "" } = await searchParams;
  const users = await db.user.findMany({
    where: {
      schoolId: admin.schoolId,
      role: role || undefined,
      OR: q ? [{ name: { contains: q } }, { email: { contains: q } }] : undefined,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { _count: { select: { enrollments: true, coursesTaught: true } } },
  });

  return (
    <>
      <PageHeader title="People" description={`Manage everyone at ${admin.school.name}.`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <form role="search" className="relative">
              <input type="hidden" name="role" value={role} />
              <label htmlFor="q" className="sr-only">Search people</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search by name or email" className="pl-9" />
            </form>
            <nav aria-label="Filter by role" className="-mx-4 overflow-x-auto px-4">
              <ul className="flex min-w-max gap-2">
                {FILTERS.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/admin/users?role=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                      aria-current={role === f.id ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium",
                        focusRing,
                        role === f.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                      )}
                    >
                      {f.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <p className="px-5 pt-3 text-xs text-slate-500" aria-live="polite">{users.length} {users.length === 1 ? "person" : "people"}</p>
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={u.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{u.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {u.email}
                    <span className="hidden sm:inline">
                      {" · "}
                      {u.role === "STUDENT" ? `${u._count.enrollments} courses${u.gradeLevel ? ` · ${u.gradeLevel}` : ""}` : u.role === "TEACHER" ? `Teaches ${u._count.coursesTaught}` : "Full access"}
                    </span>
                  </p>
                </div>
                <Badge tone={u.role === "ADMIN" ? "brand" : u.role === "TEACHER" ? "success" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                {u.id !== admin.id ? (
                  <form action={deleteUser.bind(null, u.id)}>
                    <ConfirmButton
                      message={`Remove ${u.name}? Their submissions and progress will be deleted. This can't be undone.`}
                      aria-label={`Remove ${u.name}`}
                      title="Remove person"
                      className={cn("flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600", focusRing)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </ConfirmButton>
                  </form>
                ) : (
                  <span className="size-10" />
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="self-start">
          <CardHeader title="Add a person" description="They can sign in right away." />
          <div className="p-5">
            <SimpleForm
              action={createUser}
              resetOnSuccess
              submitLabel="Add person"
              pendingLabel="Adding…"
              fields={[
                { name: "name", label: "Full name", required: true, autoComplete: "off" },
                { name: "email", label: "Email", type: "email", required: true, autoComplete: "off" },
                {
                  name: "role", label: "Role", type: "select", defaultValue: "STUDENT",
                  options: [{ value: "STUDENT", label: "Student" }, { value: "TEACHER", label: "Teacher" }, { value: "ADMIN", label: "Administrator" }],
                },
                { name: "gradeLevel", label: "Grade level", placeholder: "e.g. Grade 10", hint: "Students only." },
                { name: "password", label: "Temporary password", type: "password", required: true, autoComplete: "new-password", hint: "At least 8 characters. Share it with them privately." },
              ]}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
