"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileUp, Upload, UserPlus } from "lucide-react";
import type { ImportState } from "@/app/admin-actions";
import { toCsv } from "@/lib/csv";
import { Alert, Badge, Button, Card, CardHeader, Textarea } from "./ui";
import { SubmitButton } from "./submit-button";
import { cn, ROLE_LABEL } from "@/lib/utils";

const SAMPLE = `name,email,role,grade_level,class_codes,parent_name,parent_email
Ana Reyes,ana.reyes@school.edu,student,Grade 10,MATH24 BIO7QK,Maria Reyes,maria.reyes@gmail.com
Ben Cruz,ben.cruz@school.edu,student,Grade 10,MATH24,,
Carla Lim,carla.lim@school.edu,teacher,,,,`;

function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportUsers({ preview, run }: { preview: (s: ImportState, f: FormData) => Promise<ImportState>; run: (s: ImportState, f: FormData) => Promise<ImportState> }) {
  const [csv, setCsv] = useState("");
  const [checked, check, checking] = useActionState(preview, {});
  const [result, importNow, importing] = useActionState(run, {});
  const [stage, setStage] = useState<"edit" | "checked" | "done">("edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = (stage === "done" ? result.rows : checked.rows) ?? checked.rows ?? [];
  const bad = rows.filter((r) => r.problems.length).length;
  const fresh = rows.filter((r) => !r.exists && !r.problems.length).length;

  function submit(kind: "check" | "import") {
    const fd = new FormData();
    fd.set("csv", csv);
    setStage(kind === "check" ? "checked" : "done");
    startTransition(() => (kind === "check" ? check(fd) : importNow(fd)));
  }

  async function readFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return alert("That file is larger than 2 MB. Split it into smaller files.");
    setCsv(await f.text());
    setStage("edit");
  }

  if (stage === "done" && result.done) {
    const d = result.done;
    return (
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0 space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Import finished</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>{d.created} new {d.created === 1 ? "person" : "people"} added{d.parents ? `, plus ${d.parents} parent account${d.parents === 1 ? "" : "s"}` : ""}</li>
              <li>{d.enrolled} class enrolment{d.enrolled === 1 ? "" : "s"}</li>
              <li>{d.emailed} welcome email{d.emailed === 1 ? "" : "s"} sent</li>
            </ul>
            {d.credentials.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">{d.credentials.length} {d.credentials.length === 1 ? "person needs" : "people need"} their temporary password from you.</p>
                <p className="mt-1">Email isn't set up (or sending failed), so download the list and share each password privately. Delete the file afterwards.</p>
                <Button type="button" variant="secondary" className="mt-3" onClick={() => download("temporary-passwords.csv", toCsv([["name", "email", "role", "temporary password"], ...d.credentials.map((c) => [c.name, c.email, ROLE_LABEL[c.role], c.password])]))}>
                  <Download className="size-4" aria-hidden />Download temporary passwords
                </Button>
              </div>
            )}
            <Button type="button" variant="ghost" onClick={() => { setCsv(""); setStage("edit"); }}>Import more</Button>
          </div>
        </div>
      </Card>
    );
  }

  const msg = stage === "done" ? result.message : checked.message;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="1. Add your list" description="Upload a CSV file from Excel or Google Sheets (File → Download → CSV), or paste it below." />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <label htmlFor="csv-file" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500 sm:min-h-10">
              <FileUp className="size-4" aria-hidden />Choose CSV file
              <input ref={fileRef} id="csv-file" type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
            </label>
            <Button type="button" variant="ghost" onClick={() => download("campus-lms-import-template.csv", SAMPLE)}><Download className="size-4" aria-hidden />Download template</Button>
          </div>
          <label htmlFor="csv-text" className="sr-only">CSV contents</label>
          <Textarea id="csv-text" rows={8} value={csv} onChange={(e) => { setCsv(e.target.value); setStage("edit"); }} placeholder={SAMPLE} className="font-mono text-xs sm:text-xs" spellCheck={false} />
          <details className="text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-800">Which columns can I use?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>name</strong> and <strong>email</strong> (required)</li>
              <li><strong>role</strong>: student, teacher, parent or admin. Empty means student.</li>
              <li><strong>grade_level</strong>, e.g. Grade 10 (students)</li>
              <li><strong>class_codes</strong>: class codes separated by spaces, to enrol students right away</li>
              <li><strong>parent_name</strong> and <strong>parent_email</strong>: creates the parent account (if new) and links it</li>
            </ul>
            <p className="mt-2">People who already have an account are not changed, but they are still enrolled in the classes listed.</p>
          </details>
          <div className="flex justify-end">
            <SubmitButton pending={checking} pendingText="Checking…" variant="secondary" onClick={() => submit("check")}><Upload className="size-4" aria-hidden />Check the list</SubmitButton>
          </div>
        </div>
      </Card>

      {msg && <Alert tone="danger">{msg}</Alert>}

      {stage !== "edit" && rows.length > 0 && (
        <Card>
          <CardHeader title="2. Check and import"
            description={`${rows.length} rows · ${fresh} new · ${rows.filter((r) => r.exists).length} already have an account · ${bad} with problems`} />
          <div className="max-h-[28rem] overflow-auto" tabIndex={0} role="region" aria-label="Rows to import">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr><th className="px-4 py-2">Row</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Classes</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.line} className={cn(r.problems.length && "bg-rose-50/60")}>
                    <td className="px-4 py-2 text-slate-500">{r.line}</td>
                    <td className="px-4 py-2 text-slate-900">{r.name}{r.parentEmail && <span className="block text-xs text-slate-500">Parent: {r.parentName || r.parentEmail}</span>}</td>
                    <td className="px-4 py-2 text-slate-700">{r.email}</td>
                    <td className="px-4 py-2 text-slate-700">{ROLE_LABEL[r.role] ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">{r.classCodes.join(" ")}</td>
                    <td className="px-4 py-2">
                      {r.problems.length ? (
                        <span className="inline-flex items-start gap-1 text-xs font-medium text-rose-700"><AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{r.problems.join("; ")}</span>
                      ) : r.exists ? <Badge>Already exists</Badge> : <Badge tone="success">New</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">{bad ? "Fix the rows in red (edit the list above), then check again." : "Each new person gets a temporary password and must choose their own when they first sign in."}</p>
            <SubmitButton pending={importing} pendingText="Importing… this can take a minute" onClick={() => !bad && submit("import")}>
              <UserPlus className="size-4" aria-hidden />Import {fresh} {fresh === 1 ? "person" : "people"}
            </SubmitButton>
          </div>
        </Card>
      )}
    </div>
  );
}
