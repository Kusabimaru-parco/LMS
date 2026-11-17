"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, BookmarkPlus, CheckCircle2, Copy, Library, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { saveQuizQuestions, saveToBank } from "@/app/quiz-actions";
import { QUESTION_TYPES, type Option, type QType, type QuestionData } from "@/lib/quiz";
import { Alert, Button, Card, Input, Select, Textarea, focusRing } from "./ui";
import { cn } from "@/lib/utils";

type Q = Omit<QuestionData, "id"> & { id?: string; key: string };

const uid = () => Math.random().toString(36).slice(2, 10);
const TF: Option[] = [{ id: "true", text: "True", correct: true }, { id: "false", text: "False", correct: false }];

function blank(type: QType): Q {
  const base = { key: uid(), type, prompt: "", points: type === "ESSAY" ? 5 : 1, options: [] as Option[], answers: [] as string[], explanation: "" };
  if (type === "SINGLE" || type === "MULTIPLE") base.options = [0, 1, 2, 3].map((i) => ({ id: uid(), text: "", correct: i === 0 && type === "SINGLE" }));
  if (type === "TRUE_FALSE") base.options = TF.map((o) => ({ ...o }));
  if (type === "SHORT") base.answers = [""];
  return base;
}

function retype(q: Q, type: QType): Q {
  if (type === q.type) return q;
  const next = { ...q, type };
  if (type === "TRUE_FALSE") next.options = TF.map((o) => ({ ...o }));
  else if (type === "SINGLE" || type === "MULTIPLE") {
    const kept = q.type === "SINGLE" || q.type === "MULTIPLE" ? q.options : [];
    next.options = kept.length >= 2 ? kept : [0, 1, 2, 3].map(() => ({ id: uid(), text: "", correct: false }));
    if (type === "SINGLE") {
      const first = next.options.findIndex((o) => o.correct);
      next.options = next.options.map((o, i) => ({ ...o, correct: i === Math.max(0, first) }));
    }
  } else next.options = [];
  if (type === "SHORT" && !next.answers.length) next.answers = [""];
  return next;
}

export type BankItem = Omit<QuestionData, "id"> & { id: string; category: string };

export function QuizBuilder({ quizId, initial, attemptCount, bank = [], defaultCategory = "General" }: {
  quizId: string;
  initial: QuestionData[];
  attemptCount: number;
  bank?: BankItem[];
  defaultCategory?: string;
}) {
  const router = useRouter();
  const [qs, setQs] = useState<Q[]>(() => initial.map((q) => ({ ...q, key: q.id })));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string }>();
  const [pending, start] = useTransition();
  const [bankOpen, setBankOpen] = useState(false);
  const [bankNote, setBankNote] = useState<string>();

  function toBank(q: Q) {
    const category = window.prompt("Save to the question bank under which topic?", defaultCategory);
    if (category === null) return;
    const { key: _k, id: _id, ...rest } = q;
    start(async () => {
      const r = await saveToBank(JSON.stringify(rest), category);
      setBankNote(r.message);
    });
  }

  function addFromBank(items: BankItem[]) {
    change((l) => [...l, ...items.map(({ id: _id, category: _c, ...q }) => ({ ...structuredClone(q), key: uid() }))]);
    setBankOpen(false);
  }
  const total = qs.reduce((s, q) => s + (Number(q.points) || 0), 0);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(fn: (list: Q[]) => Q[]) {
    setQs(fn);
    setDirty(true);
    setResult(undefined);
  }
  const update = (i: number, patch: Partial<Q>) => change((l) => l.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => change((l) => {
    const a = [...l];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    return a;
  });

  function add(type: QType) {
    change((l) => [...l, blank(type)]);
    setTimeout(() => document.getElementById(`q-${qs.length}-prompt`)?.focus(), 50);
  }

  function save() {
    start(async () => {
      const payload = qs.map(({ key: _key, ...q }) => q);
      const res = await saveQuizQuestions(quizId, JSON.stringify(payload));
      setErrors(res.errors ?? {});
      setResult({ ok: res.ok, message: res.message });
      if (res.ok && res.ids) {
        setQs((l) => l.map((q, i) => ({ ...q, id: res.ids![i], key: q.key })));
        setDirty(false);
        router.refresh();
      } else if (res.errors) {
        const first = Math.min(...Object.keys(res.errors).map(Number));
        document.getElementById(`question-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {attemptCount > 0 && (
        <Alert tone="info">
          {attemptCount} attempt{attemptCount === 1 ? " has" : "s have"} already been made. Fixing a typo is fine; if you change correct answers,
          use <strong>Regrade attempts</strong> on the results page afterwards.
        </Alert>
      )}

      {qs.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-base font-semibold text-slate-900">Add your first question</p>
          <p className="mt-1 text-sm text-slate-500">Choose a question type below.</p>
        </Card>
      )}

      {qs.map((q, i) => (
        <Card key={q.key} id={`question-${i}`} className={cn("scroll-mt-24", errors[i] && "border-rose-300 ring-1 ring-rose-200")}>
          <fieldset>
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">Question {i + 1}</span>
              <label className="sr-only" htmlFor={`q-${i}-type`}>Question type</label>
              <Select id={`q-${i}-type`} value={q.type} onChange={(e) => change((l) => l.map((x, j) => (j === i ? retype(x, e.target.value as QType) : x)))} className="w-auto min-w-40">
                {QUESTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600" htmlFor={`q-${i}-points`}>
                Points
                <Input id={`q-${i}-points`} type="number" min={0} max={1000} value={q.points} onChange={(e) => update(i, { points: Number(e.target.value) })} className="w-20" />
              </label>
              <div className="flex">
                <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden /></IconBtn>
                <IconBtn label="Move down" disabled={i === qs.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden /></IconBtn>
                <IconBtn label="Save to question bank" onClick={() => toBank(q)}><BookmarkPlus className="size-4" aria-hidden /></IconBtn>
                <IconBtn label="Duplicate" onClick={() => change((l) => [...l.slice(0, i + 1), { ...structuredClone(q), id: undefined, key: uid() }, ...l.slice(i + 1)])}><Copy className="size-4" aria-hidden /></IconBtn>
                <IconBtn label="Delete question" danger onClick={() => { if (confirm(`Delete question ${i + 1}?`)) change((l) => l.filter((_, j) => j !== i)); }}><Trash2 className="size-4" aria-hidden /></IconBtn>
              </div>
            </div>

            <div className="space-y-4 p-4">
              {errors[i] && <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-rose-700"><AlertTriangle className="size-4" aria-hidden />{errors[i]}</p>}
              <div>
                <label htmlFor={`q-${i}-prompt`} className="mb-1.5 block text-sm font-medium text-slate-800">Question</label>
                <Textarea id={`q-${i}-prompt`} rows={2} value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })}
                  placeholder={q.type === "TRUE_FALSE" ? "e.g. Water boils at 100 °C at sea level." : "Type the question"} />
              </div>

              {(q.type === "SINGLE" || q.type === "MULTIPLE") && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-800">
                    Answers <span className="font-normal text-slate-500">({q.type === "SINGLE" ? "select the correct one" : "tick every correct one"})</span>
                  </p>
                  <ul className="space-y-2">
                    {q.options.map((o, oi) => (
                      <li key={o.id} className="flex items-center gap-2">
                        <input
                          type={q.type === "SINGLE" ? "radio" : "checkbox"}
                          name={`q-${q.key}-correct`}
                          checked={o.correct}
                          onChange={(e) => update(i, { options: q.options.map((x, xi) => (q.type === "SINGLE" ? { ...x, correct: xi === oi } : xi === oi ? { ...x, correct: e.target.checked } : x)) })}
                          aria-label={`Answer ${oi + 1} is correct`}
                          className="size-5 shrink-0 accent-emerald-600"
                        />
                        <Input value={o.text} onChange={(e) => update(i, { options: q.options.map((x, xi) => (xi === oi ? { ...x, text: e.target.value } : x)) })}
                          placeholder={`Answer ${oi + 1}`} aria-label={`Answer ${oi + 1}`} className={cn(o.correct && "border-emerald-400 bg-emerald-50/50")} />
                        <IconBtn label={`Remove answer ${oi + 1}`} disabled={q.options.length <= 2} onClick={() => update(i, { options: q.options.filter((_, xi) => xi !== oi) })}><X className="size-4" aria-hidden /></IconBtn>
                      </li>
                    ))}
                  </ul>
                  {q.options.length < 12 && (
                    <button type="button" onClick={() => update(i, { options: [...q.options, { id: uid(), text: "", correct: false }] })}
                      className={cn("mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}>
                      <Plus className="size-4" aria-hidden />Add answer
                    </button>
                  )}
                </div>
              )}

              {q.type === "TRUE_FALSE" && (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium text-slate-800">The statement is</legend>
                  <div className="flex gap-2">
                    {TF.map((t) => {
                      const on = q.options.find((o) => o.id === t.id)?.correct;
                      return (
                        <label key={t.id} className={cn("flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm font-medium focus-within:ring-2 focus-within:ring-brand-500 sm:flex-none sm:px-6",
                          on ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-300 text-slate-700 hover:bg-slate-50")}>
                          <input type="radio" name={`q-${q.key}-tf`} className="sr-only" checked={!!on}
                            onChange={() => update(i, { options: TF.map((x) => ({ ...x, correct: x.id === t.id })) })} />
                          {on && <CheckCircle2 className="size-4" aria-hidden />}{t.text}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {q.type === "SHORT" && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-800">Accepted answers</p>
                  <ul className="space-y-2">
                    {q.answers.map((a, ai) => (
                      <li key={ai} className="flex items-center gap-2">
                        <Input value={a} onChange={(e) => update(i, { answers: q.answers.map((x, xi) => (xi === ai ? e.target.value : x)) })} placeholder="e.g. photosynthesis" aria-label={`Accepted answer ${ai + 1}`} />
                        <IconBtn label={`Remove accepted answer ${ai + 1}`} disabled={q.answers.length <= 1} onClick={() => update(i, { answers: q.answers.filter((_, xi) => xi !== ai) })}><X className="size-4" aria-hidden /></IconBtn>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => update(i, { answers: [...q.answers, ""] })}
                    className={cn("mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}>
                    <Plus className="size-4" aria-hidden />Add another accepted answer
                  </button>
                  <p className="mt-1 text-xs text-slate-500">Capital letters, extra spaces and a final full stop are ignored. You can change marks by hand later.</p>
                </div>
              )}

              {q.type === "ESSAY" && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Students write a longer answer. You give the points on the results page.</p>}

              <details className="text-sm" open={!!q.explanation}>
                <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900">Explanation (optional)</summary>
                <Textarea rows={2} className="mt-2" value={q.explanation} onChange={(e) => update(i, { explanation: e.target.value })}
                  placeholder="Shown with the correct answer when results are released." aria-label={`Explanation for question ${i + 1}`} />
              </details>
            </div>
          </fieldset>
        </Card>
      ))}

      {bankNote && <p role="status" className="text-sm text-emerald-700">{bankNote}</p>}
      {bankOpen && <BankPicker bank={bank} onAdd={addFromBank} onClose={() => setBankOpen(false)} />}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">Add a question</p>
          <button type="button" onClick={() => setBankOpen((o) => !o)} aria-expanded={bankOpen}
            className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand-700 hover:bg-brand-50", focusRing)}>
            <Library className="size-4" aria-hidden />From the question bank ({bank.length})
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {QUESTION_TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => add(t.id)} title={t.hint}
              className={cn("flex min-h-11 flex-col items-start justify-center rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50", focusRing)}>
              <span className="text-sm font-medium text-slate-900">{t.label}</span>
              <span className="text-xs text-slate-500">{t.hint}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 lg:bottom-4">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600" aria-live="polite">
            {qs.length} question{qs.length === 1 ? "" : "s"} · {total} points ·{" "}
            {result ? <span className={result.ok ? "text-emerald-700" : "font-medium text-rose-700"}>{result.message}</span> : dirty ? <span className="font-medium text-amber-700">Unsaved changes</span> : "All changes saved"}
          </p>
          <Button type="button" onClick={save} disabled={pending || (!dirty && !Object.keys(errors).length)}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}{pending ? "Saving…" : "Save questions"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30", danger && "hover:bg-rose-50 hover:text-rose-600", focusRing)}>
      {children}
    </button>
  );
}

function BankPicker({ bank, onAdd, onClose }: { bank: BankItem[]; onAdd: (items: BankItem[]) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const cats = [...new Set(bank.map((b) => b.category))].sort();
  const list = bank.filter((b) => (!cat || b.category === cat) && (!q || b.prompt.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Question bank</h3>
        <IconBtn label="Close question bank" onClick={onClose}><X className="size-4" aria-hidden /></IconBtn>
      </div>
      {bank.length === 0 ? (
        <p className="p-4 text-sm text-slate-600">The bank is empty. Use the bookmark button on any question to save it here, so you and other teachers can reuse it.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 p-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input aria-label="Search the question bank" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions" className="pl-9" />
            </div>
            <Select aria-label="Topic" value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-48">
              <option value="">All topics</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
            {list.map((b) => (
              <li key={b.id}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(b.id)} className="mt-1 size-4 accent-brand-600"
                    onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} />
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-900">{b.prompt}</span>
                    <span className="block text-xs text-slate-500">{b.category} · {QUESTION_TYPES.find((t) => t.id === b.type)?.label} · {b.points} pt{b.points === 1 ? "" : "s"}</span>
                  </span>
                </label>
              </li>
            ))}
            {list.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No questions match.</li>}
          </ul>
          <div className="flex justify-end border-t border-slate-100 p-3">
            <Button type="button" disabled={!picked.size} onClick={() => onAdd(bank.filter((b) => picked.has(b.id)))}>
              <Plus className="size-4" aria-hidden />Add {picked.size || ""} question{picked.size === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
