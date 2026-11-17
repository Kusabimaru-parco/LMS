import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FileBadge, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { avatarUrl } from "@/lib/utils";

export const metadata: Metadata = { title: "Report cards" };

export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser(["ADMIN", "STUDENT", "PARENT"]);
  if (user.role === "STUDENT") redirect(`/report-cards/${user.id}`);
  const { q = "" } = await searchParams;
  const students = user.role === "PARENT"
    ? (await db.parentLink.findMany({ where: { parentId: user.id }, include: { student: { select: { id: true, name: true, gradeLevel: true, avatarUpdatedAt: true } } } })).map((l) => l.student)
    : await db.user.findMany({
        where: { schoolId: user.schoolId, role: "STUDENT", ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
        orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
        select: { id: true, name: true, gradeLevel: true, avatarUpdatedAt: true },
      });
  if (user.role === "PARENT" && students.length === 1) redirect(`/report-cards/${students[0].id}`);
  const groups = [...new Set(students.map((s) => s.gradeLevel ?? "No grade level"))];

  return (
    <>
      <PageHeader title="Report cards" description={user.role === "PARENT" ? "Choose a child." : "Choose a student to view, print or save their report card as a PDF."} />
      {user.role === "ADMIN" && (
        <form role="search" className="relative mb-6 max-w-md">
          <label htmlFor="rq" className="sr-only">Search students</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input id="rq" name="q" type="search" defaultValue={q} placeholder="Search students" className="pl-9" />
        </form>
      )}
      {students.length === 0 ? (
        <Card><EmptyState icon={FileBadge} title="No students">{user.role === "PARENT" ? "Your account isn't linked to a student yet. Ask the school office." : "No students match."}</EmptyState></Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g}>
              <CardHeader title={g} />
              <ul className="grid sm:grid-cols-2">
                {students.filter((s) => (s.gradeLevel ?? "No grade level") === g).map((s) => (
                  <li key={s.id} className="border-b border-slate-100">
                    <Link href={`/report-cards/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                      <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
                      <span className="flex-1 truncate text-sm font-medium text-slate-900">{s.name}</span>
                      <ChevronRight className="size-4 text-slate-400" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
