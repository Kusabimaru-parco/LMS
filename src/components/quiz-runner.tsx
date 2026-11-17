"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Clock, CloudOff, Loader2, Send } from "lucide-react";
import { saveAttempt, submitAttempt } from "@/app/quiz-actions";
import type { AnswerMap, PublicQuestion } from "@/lib/quiz";
import { Button, Card, Textarea, focusRing } from "./ui";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "saving" | "dirty" | "offline";

export function QuizRunner({
  attemptId,
  kind,
  questions,
  initialAnswers,
  deadlineAt,
  serverNow,
  initialFocusLost,
}: {
  attemptId: string;
  kind: string;
  questions: PublicQuestion[];
  initialAnswers: AnswerMap;
  deadlineAt: string | null;
  serverNow: string;
  initialFocusLost: number;
}) {
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const [save, setSave] = useState<SaveState>("saved");
  const [focusLost, setFocusLost] = useState(initialFocusLost);
  const [left, setLeft] = useState<number | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const answersRef = useRef(answers);
  const focusRef = useRef(focusLost);
  const submitted = useRef(false);
  const skew = useRef(new Date(serverNow).getTime() - Date.now());
  const isExam = kind === "EXAM";
  const answered = questions.filter((q) => isAnswered(answers[q.id])).length;

  answersRef.current = answers;
  focusRef.current = focusLost;

  const persist = useCallback(async () => {
    setSave("saving");
    try {
      const r = await saveAttempt(attemptId, answersRef.current, focusRef.current);
      if (r.expired || r.submitted) return finish(true);
      setSave(r.ok ? "saved" : "offline");
    } catch {
      setSave("offline");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  const finish = useCallback((force = false) => {
    if (submitted.current) return;
    if (!force) return setConfirming(true);
    submitted.current = true;
    startSubmit(async () => {
      await submitAttempt(attemptId, answersRef.current, focusRef.current);
    });
  }, [attemptId]);

  // Autosave shortly after each change, and retry while offline.
  useEffect(() => {
    if (save !== "dirty" && save !== "offline") return;
    const t = setTimeout(persist, save === "offline" ? 5000 : 1200);
    return () => clearTimeout(t);
  }, [answers, save, persist]);

  // Countdown, synced to the server clock. Submits automatically at zero.
  useEffect(() => {
    if (!deadlineAt) return;
    const end = new Date(deadlineAt).getTime();
    const tick = () => {
      const ms = end - (Date.now() + skew.current);
      setLeft(Math.max(0, ms));
      if (ms <= 0) finish(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadlineAt, finish]);

  // Exams record each time the student leaves the page.
  useEffect(() => {
    if (!isExam) return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && !submitted.current) {
        setFocusLost((n) => n + 1);
        setSave("dirty");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [isExam]);

  // Warn before closing the tab with unsaved answers.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!submitted.current && save !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  function setAnswer(id: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [id]: value }));
    setSave("dirty");
  }

  const hours = left == null ? 0 : Math.floor(left / 3_600_000);
  const mins = left == null ? 0 : Math.floor((left % 3_600_000) / 60000);
  const secs = left == null ? 0 : Math.floor((left % 60000) / 1000);
  const low = left != null && left < 5 * 60_000;
  // A far-away close date isn't a countdown worth showing; the attempt still ends automatically.
  const showTimer = left != null && left < 3 * 3_600_000;
  const clock = `${hours ? `${hours}:` : ""}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const unanswered = questions.length - answered;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="sticky top-14 z-10 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border lg:top-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {showTimer && (
            <span role="timer" aria-live={low ? "assertive" : "off"} aria-label={`Time left: ${hours ? `${hours} hours ` : ""}${mins} minutes ${secs} seconds`}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-base font-semibold tabular-nums", low ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-900")}>
              <Clock className="size-4" aria-hidden />{clock}
            </span>
          )}
          <span className="text-sm text-slate-600">{answered} of {questions.length} answered</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite">
            {save === "saving" && <><Loader2 className="size-3.5 animate-spin" aria-hidden />Saving…</>}
            {save === "saved" && <><CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />Answers saved</>}
            {save === "dirty" && "Unsaved changes"}
            {save === "offline" && <span className="inline-flex items-center gap-1.5 font-medium text-amber-700"><CloudOff className="size-3.5" aria-hidden />Offline. Retrying…</span>}
          </span>
        </div>
        <nav aria-label="Jump to question" className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {questions.map((q, i) => (
            <a key={q.id} href={`#q-${i + 1}`}
              className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold", focusRing,
                isAnswered(answers[q.id]) ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50")}>
              {i + 1}<span className="sr-only">{isAnswered(answers[q.id]) ? " (answered)" : " (not answered)"}</span>
            </a>
          ))}
        </nav>
      </div>

      {isExam && focusLost > 0 && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />You left this page {focusLost} time{focusLost === 1 ? "" : "s"}. Your teacher can see this.
        </p>
      )}

      {questions.map((q, i) => (
        <Card key={q.id} id={`q-${i + 1}`} className="scroll-mt-40">
          <fieldset className="p-5">
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question {i + 1}</p>
              <p className="shrink-0 text-xs text-slate-500">{q.points} point{q.points === 1 ? "" : "s"}</p>
            </div>
            <p className="whitespace-pre-line text-base font-medium leading-relaxed text-slate-900">{q.prompt}</p>
            <div className="mt-4">
              {(q.type === "SINGLE" || q.type === "TRUE_FALSE") && (
                <div className="space-y-2">
                  {q.options.map((o) => {
                    const on = answers[q.id] === o.id;
                    return (
                      <label key={o.id} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 text-sm focus-within:ring-2 focus-within:ring-brand-500",
                        on ? "border-brand-600 bg-brand-50 text-slate-900" : "border-slate-200 text-slate-800 hover:bg-slate-50")}>
                        <input type="radio" name={`ans-${q.id}`} value={o.id} checked={on} onChange={() => setAnswer(q.id, o.id)} className="size-4 shrink-0 accent-brand-600" />
                        <span>{o.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {q.type === "MULTIPLE" && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Choose all that apply.</p>
                  {q.options.map((o) => {
                    const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                    const on = cur.includes(o.id);
                    return (
                      <label key={o.id} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 text-sm focus-within:ring-2 focus-within:ring-brand-500",
                        on ? "border-brand-600 bg-brand-50 text-slate-900" : "border-slate-200 text-slate-800 hover:bg-slate-50")}>
                        <input type="checkbox" checked={on} onChange={(e) => setAnswer(q.id, e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id))}
                          className="size-4 shrink-0 rounded accent-brand-600" />
                        <span>{o.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {q.type === "SHORT" && (
                <input type="text" value={(answers[q.id] as string) ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} maxLength={500} aria-label={`Answer to question ${i + 1}`}
                  autoComplete="off" className="block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              )}
              {q.type === "ESSAY" && (
                <Textarea rows={8} value={(answers[q.id] as string) ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} maxLength={20000} aria-label={`Answer to question ${i + 1}`} />
              )}
            </div>
          </fieldset>
        </Card>
      ))}

      <Card className="p-5">
        {confirming ? (
          <div role="alertdialog" aria-labelledby="confirm-title" className="space-y-3">
            <p id="confirm-title" className="text-base font-semibold text-slate-900">Submit your answers?</p>
            <p className="text-sm text-slate-600">
              {unanswered ? `You haven't answered ${unanswered} question${unanswered === 1 ? "" : "s"}. ` : "You've answered every question. "}
              You can't change your answers after submitting.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={submitting}>Keep working</Button>
              <Button type="button" onClick={() => finish(true)} disabled={submitting} autoFocus>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                {submitting ? "Submitting…" : "Submit now"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">Your answers are saved as you go. Submit when you're finished.</p>
            <Button type="button" onClick={() => finish()} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {submitting ? "Submitting…" : isExam ? "Submit exam" : "Submit quiz"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function isAnswered(a: string | string[] | undefined) {
  return Array.isArray(a) ? a.length > 0 : typeof a === "string" && a.trim().length > 0;
}
