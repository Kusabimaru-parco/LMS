"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Link2, Loader2, Plus, X } from "lucide-react";
import { Alert, Button, Field, Input, Textarea, focusRing } from "./ui";
import { formatBytes, postWithProgress } from "./upload";
import { cn } from "@/lib/utils";

type LinkItem = { url: string; title: string };

/** Hand in an assignment: a written answer plus files (up to the size limit) and links. */
export function SubmissionForm({
  assignmentId,
  maxMb,
  accept,
  defaultContent,
  existingCount,
  isUpdate,
}: {
  assignmentId: string;
  maxMb: number;
  accept: string;
  defaultContent: string;
  existingCount: number;
  isUpdate: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState(defaultContent);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tooBig, setTooBig] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [progress, setProgress] = useState<number | null>(null);
  const limit = maxMb * 1024 * 1024;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const all = Array.from(list);
    const big = all.filter((f) => f.size > limit).map((f) => f.name);
    setFiles((cur) => [...cur, ...all.filter((f) => f.size <= limit)]);
    setTooBig(big);
    setErrors((e) => ({ ...e, files: "" }));
    if (fileRef.current) fileRef.current.value = "";
    if (big.length) setTimeout(() => linkRef.current?.focus(), 0);
  }

  function addLink() {
    const url = linkDraft.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) return setErrors((e) => ({ ...e, links: "Paste a full link starting with https://" }));
    setLinks((cur) => [...cur, { url, title: "" }]);
    setLinkDraft("");
    setErrors((e) => ({ ...e, links: "" }));
    setTooBig([]);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (progress !== null) return;
    const pendingLink = linkDraft.trim();
    const allLinks = pendingLink && /^https?:\/\/\S+\.\S+/i.test(pendingLink) ? [...links, { url: pendingLink, title: "" }] : links;
    if (!content.trim() && !files.length && !allLinks.length && !existingCount) {
      setErrors({ content: "Write an answer, or attach a file or link." });
      return;
    }
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > maxMb * 2 * 1024 * 1024) {
      setErrors({ files: `These files add up to ${formatBytes(total)}. Hand in up to ${maxMb * 2} MB at once, and share the rest as links.` });
      return;
    }
    const fd = new FormData();
    fd.set("assignmentId", assignmentId);
    fd.set("content", content);
    fd.set("links", JSON.stringify(allLinks));
    for (const f of files) fd.append("files", f);
    setMessage(undefined);
    setErrors({});
    setProgress(0);
    const res = await postWithProgress("/api/upload/submission", fd, setProgress);
    setProgress(null);
    if (!res.ok) {
      setErrors(res.errors ?? {});
      setMessage({ ok: false, text: res.message ?? "Something went wrong." });
      return;
    }
    setFiles([]);
    setLinks([]);
    setLinkDraft("");
    setMessage({ ok: true, text: res.message ?? "Handed in." });
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {message && <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert>}

      <Field label="Your answer" htmlFor="s-content" error={errors.content}
        hint={existingCount || files.length || links.length ? "Optional when you attach files or links." : "Write your answer, or attach files and links below."}>
        <Textarea id="s-content" rows={7} value={content} onChange={(e) => setContent(e.target.value)} maxLength={50000}
          aria-invalid={!!errors.content || undefined} aria-describedby={errors.content ? "s-content-error" : "s-content-hint"} />
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-800">Attach files</p>
        <label htmlFor="s-files" className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500 sm:min-h-10")}>
          <FileUp className="size-4" aria-hidden /> Choose files
          <input ref={fileRef} id="s-files" type="file" multiple accept={accept} className="sr-only" onChange={(e) => addFiles(e.target.files)} aria-describedby="s-files-hint" />
        </label>
        <p id="s-files-hint" className="mt-1.5 text-xs text-slate-500">Documents, slides, PDFs, images or MP4 videos · up to {maxMb} MB each</p>
        {tooBig.length > 0 && (
          <div role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">{tooBig.length === 1 ? `"${tooBig[0]}" is too big` : `${tooBig.length} files are too big`} to upload (limit {maxMb} MB).</p>
            <p className="mt-1">Upload {tooBig.length === 1 ? "it" : "them"} to Google Drive, OneDrive or YouTube (unlisted), set sharing to <strong>Anyone with the link</strong>, then paste the link below.</p>
          </div>
        )}
        {errors.files && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{errors.files}</p>}
        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <FileUp className="size-4 shrink-0 text-slate-500" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-slate-900">{f.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatBytes(f.size)}</span>
                <button type="button" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}
                  className={cn("flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200", focusRing)}>
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="s-link" className="mb-1.5 block text-sm font-medium text-slate-800">Add a link</label>
        <div className="flex gap-2">
          <Input ref={linkRef} id="s-link" type="url" inputMode="url" placeholder="https://drive.google.com/…" value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
            aria-invalid={!!errors.links || undefined} aria-describedby={errors.links ? "s-link-error" : "s-link-hint"} />
          <Button type="button" variant="secondary" onClick={addLink} className="shrink-0"><Plus className="size-4" aria-hidden />Add</Button>
        </div>
        {errors.links ? (
          <p id="s-link-error" role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{errors.links}</p>
        ) : (
          <p id="s-link-hint" className="mt-1.5 text-xs text-slate-500">For big videos and files: Google Drive, OneDrive, YouTube, Canva…</p>
        )}
        {links.length > 0 && (
          <ul className="mt-3 space-y-2">
            {links.map((l, i) => (
              <li key={`${l.url}-${i}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <Link2 className="size-4 shrink-0 text-slate-500" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-slate-900">{l.url}</span>
                <button type="button" onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove link ${l.url}`}
                  className={cn("flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200", focusRing)}>
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {progress !== null && (
        <div role="progressbar" aria-label="Upload progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-600 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={progress !== null}>
          {progress !== null && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {progress !== null ? (progress < 100 && files.length ? `Uploading… ${progress}%` : "Handing in…") : isUpdate ? "Update submission" : "Hand in"}
        </Button>
      </div>
    </form>
  );
}
