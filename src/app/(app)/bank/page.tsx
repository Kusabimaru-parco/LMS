import type { Metadata } from "next";
import Link from "next/link";
import { Library, Search, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toQuestion, typeLabel } from "@/lib/quiz";
import { deleteBankQuestion } from "@/app/quiz-actions";
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader, focusRing } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Question bank" };

export default async function BankPage({ searchParams }: { searchParams: Promise<{ q?: string; topic?: string }> }) {
  const user = await requireUser(["ADMIN", "TEACHER"]);
  const { q = "", topic = "" } = await searchParams;
  const [rows, topics] = await Promise.all([
    db.bankQuestion.findMany({
      where: { schoolId: user.schoolId, ...(topic ? { category: topic } : {}), ...(q ? { prompt: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: [{ category: "asc" }, { createdAt: "desc" }],
      include: { owner: { select: { id: true, name: true } } },
      take: 500,
    }),
    db.bankQuestion.groupBy({ by: ["category"], where: { schoolId: user.schoolId }, _count: true, orderBy: { category: "asc" } }),
  ]);
  const groups = [...new Set(rows.map((r) => r.category))];

  return (
    <>
      <PageHeader title="Question bank" description="Questions saved by teachers at your school. Add them to any quiz or exam from the question builder." />
      <Card className="mb-6 space-y-3 p-4">
        <form role="search" className="relative">
          <input type="hidden" name="topic" value={topic} />
          <label htmlFor="bq" className="sr-only">Search questions</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input id="bq" name="q" type="search" defaultValue={q} placeholder="Search questions" className="pl-9" />
        </form>
        {topics.length > 0 && (
          <nav aria-label="Filter by topic" className="no-scrollbar -mx-4 overflow-x-auto px-4">
            <ul className="flex min-w-max gap-2">
              {[{ category: "", _count: topics.reduce((n, t) => n + t._count, 0) }, ...topics].map((t) => (
                <li key={t.category}>
                  <Link href={`/bank?topic=${encodeURIComponent(t.category)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={topic === t.category ? "page" : undefined}
                    className={cn("inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium", focusRing, topic === t.category ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
                    {t.category || "All topics"} <span className="ml-1.5 opacity-70">{t._count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Library} title={q || topic ? "No matching questions" : "The bank is empty"}>
            {q || topic ? "Try another search or topic." : "Open any quiz's questions and use the bookmark button on a question to save it here."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g}>
              <CardHeader title={g} description={`${rows.filter((r) => r.category === g).length} questions`} />
              <ul className="divide-y divide-slate-100">
                {rows.filter((r) => r.category === g).map((r) => {
                  const qd = toQuestion(r);
                  const canDelete = user.role === "ADMIN" || r.ownerId === user.id;
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-900">{r.prompt}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <Badge>{typeLabel(r.type)}</Badge>
                          <span>{r.points} pt{r.points === 1 ? "" : "s"}</span>
                          {qd.options.some((o) => o.correct) && <span>Answer: {qd.options.filter((o) => o.correct).map((o) => o.text).join(", ")}</span>}
                          {qd.answers.length > 0 && <span>Accepted: {qd.answers.join(", ")}</span>}
                          {r.owner && <span>· by {r.owner.name}</span>}
                        </p>
                      </div>
                      {canDelete && (
                        <form action={deleteBankQuestion.bind(null, r.id)}>
                          <ConfirmButton message="Delete this question from the bank? Quizzes that already use it keep their copy." aria-label="Delete question"
                            className={cn("flex size-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600", focusRing)}>
                            <Trash2 className="size-4" aria-hidden />
                          </ConfirmButton>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
