"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Link2, Loader2, UploadCloud, X } from "lucide-react";
import { Alert, Button, Field, Input, Textarea, focusRing } from "./ui";
import { formatBytes, postWithProgress } from "./upload";
import { cn } from "@/lib/utils";

type Source = "file" | "link" | "none";

/**
 * New module (title + activity description + first material) or "add material" to an existing module.
 * Files go to /api/upload/material with a progress bar.
 */
export function MaterialForm({
  courseId,
  moduleId,
  maxMb,
  accept,
  onDoneHref,
}: {
  courseId: string;
  moduleId?: string;
  maxMb: number;
  accept: string;
  onDoneHref?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const isNew = !moduleId;
  const [source, setSource] = useState<Source>(isNew ? "file" : "file");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [progress, setProgress] = useState<number | null>(null);
  const tooBig = !!file && file.size > maxMb * 1024 * 1024;

  function chooseFile(f: File | undefined) {
    setErrors((e) => ({ ...e, file: "" }));
    setFile(f ?? null);
  }

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (progress !== null) return;
    const fd = new FormData(ev.currentTarget);
    fd.set("courseId", courseId);
    if (moduleId) fd.set("moduleId", moduleId);
    fd.set("source", source);
    fd.delete("file");
    const errs: Record<string, string> = {};
    if (isNew && String(fd.get("title") ?? "").trim().length < 2) errs.title = "Give the module a title.";
    if (source === "file") {
      if (!file) errs.file = "Choose a file to upload.";
      else if (tooBig) errs.file = tooBigMessage(file, maxMb);
      else fd.set("file", file);
    }
    if (source === "link" && !/^https?:\/\/\S+$/i.test(String(fd.get("url") ?? "").trim())) errs.url = "Paste a full link starting with https://";
    setErrors(errs);
    setMessage(undefined);
    if (Object.values(errs).some(Boolean)) return;

    setProgress(0);
    const res = await postWithProgress("/api/upload/material", fd, setProgress);
    setProgress(null);
    if (!res.ok) {
      setErrors(res.errors ?? {});
      setMessage({ ok: false, text: res.message ?? "Something went wrong." });
      return;
    }
    if (isNew) {
      router.push(onDoneHref ?? res.url ?? `/courses/${courseId}`);
      return;
    }
    formRef.current?.reset();
    setFile(null);
    setMessage({ ok: true, text: "Material added." });
    router.refresh();
  }

  const tabs: { id: Source; label: string; icon: typeof FileUp }[] = [
    { id: "file", label: "Upload a file", icon: FileUp },
    { id: "link", label: "Paste a link", icon: Link2 },
    ...(isNew ? [{ id: "none" as Source, label: "No material", icon: X }] : []),
  ];

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      {message && <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert>}

      {isNew && (
        <>
          <Field label="Module title" htmlFor="m-title" required error={errors.title}>
            <Input id="m-title" name="title" required maxLength={200} placeholder="e.g. Week 1: Cells and life"
              aria-invalid={!!errors.title || undefined} aria-describedby={errors.title ? "m-title-error" : undefined} />
          </Field>
          <Field label="Activities and instructions" htmlFor="m-description" error={errors.description}
            hint="Tell students what to read, watch and do in this module. Start a line with ## for a heading or - for a list item.">
            <Textarea id="m-description" name="description" rows={7} maxLength={20000}
              placeholder={"## This week\n- Read the slides below\n- Answer the quiz by Friday\n- Bring a leaf to class"}
              aria-describedby={errors.description ? "m-description-error" : "m-description-hint"} />
          </Field>
        </>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">{isNew ? "Learning material" : "Add material"}</legend>
        <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {tabs.map((t) => (
            <label key={t.id}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium focus-within:ring-2 focus-within:ring-brand-500",
                source === t.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}>
              <input type="radio" name="sourcePick" value={t.id} checked={source === t.id} onChange={() => setSource(t.id)} className="sr-only" />
              <t.icon className="size-4" aria-hidden />{t.label}
            </label>
          ))}
        </div>
      </fieldset>

      {source === "file" && (
        <div>
          <label htmlFor="m-file"
            className={cn("flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500",
              errors.file || tooBig ? "border-rose-300 bg-rose-50/40" : "border-slate-300")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files[0]); }}>
            <UploadCloud className="size-7 text-slate-400" aria-hidden />
            {file ? (
              <span className="text-sm font-medium text-slate-900">{file.name} <span className="font-normal text-slate-500">· {formatBytes(file.size)}</span></span>
            ) : (
              <span className="text-sm font-medium text-slate-900">Choose a file or drag it here</span>
            )}
            <span className="text-xs text-slate-500">PDF, PowerPoint, Word, Excel, images or MP4 · up to {maxMb} MB</span>
            <input id="m-file" type="file" accept={accept} className="sr-only" onChange={(e) => chooseFile(e.target.files?.[0])}
              aria-describedby={errors.file || tooBig ? "m-file-error" : undefined} />
          </label>
          {(errors.file || tooBig) && (
            <div id="m-file-error" role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>{errors.file || tooBigMessage(file!, maxMb)}</p>
              {tooBig && (
                <button type="button" className="mt-2 font-medium text-brand-700 underline" onClick={() => { setSource("link"); setTimeout(() => linkRef.current?.focus(), 0); }}>
                  Share it as a link instead
                </button>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">Tip: PDFs open right inside the LMS on any device. PowerPoint files are downloaded, so saving slides as PDF works best for students.</p>
        </div>
      )}

      {source === "link" && (
        <Field label="Link" htmlFor="m-url" required error={errors.url}
          hint="Google Slides, Google Drive, OneDrive, YouTube, or a link to any PDF or PowerPoint. Make sure students can open it (share with 'Anyone with the link').">
          <Input ref={linkRef} id="m-url" name="url" type="url" inputMode="url" placeholder="https://"
            aria-invalid={!!errors.url || undefined} aria-describedby={errors.url ? "m-url-error" : "m-url-hint"} />
        </Field>
      )}

      {source !== "none" && (
        <Field label="Material name" htmlFor="m-mtitle" hint="Optional. Defaults to the file name or website.">
          <Input id="m-mtitle" name="materialTitle" maxLength={200} placeholder="e.g. Chapter 1 slides" aria-describedby="m-mtitle-hint" />
        </Field>
      )}

      {progress !== null && (
        <div role="progressbar" aria-label="Upload progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={progress !== null} className={focusRing}>
          {progress !== null && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {progress !== null ? (progress < 100 ? `Uploading… ${progress}%` : "Saving…") : isNew ? "Create module" : "Add material"}
        </Button>
      </div>
    </form>
  );
}

function tooBigMessage(file: File, maxMb: number) {
  return `"${file.name}" is ${formatBytes(file.size)}, but the limit is ${maxMb} MB. Upload it to Google Drive, OneDrive or YouTube, then paste the share link here instead.`;
}
