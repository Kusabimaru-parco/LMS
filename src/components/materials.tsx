// Displays learning materials and submission attachments (server component).
import { Download, ExternalLink, FileImage, FileSpreadsheet, FileText, Link2, Presentation, Trash2, Video } from "lucide-react";
import { embedUrl, formatLabel, formatSize } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { focusRing } from "./ui";
import { ConfirmButton } from "./confirm-button";

const ICONS = { pdf: FileText, slides: Presentation, doc: FileText, sheet: FileSpreadsheet, image: FileImage, video: Video } as const;
export const formatIcon = (format: string) => ICONS[format as keyof typeof ICONS] ?? Link2;

type FileInfo = { id: string; name: string; size: number; mime: string } | null;
export type MaterialItem = { id: string; title: string; kind: string; format: string; url: string | null; file: FileInfo };

const linkBtn = cn(
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50",
  focusRing,
);

function hrefOf(m: { kind: string; url: string | null; file: FileInfo }) {
  return m.kind === "FILE" && m.file ? `/api/files/${m.file.id}` : (m.url ?? "#");
}

function Preview({ m }: { m: MaterialItem }) {
  if (m.kind === "FILE" && m.file) {
    const src = `/api/files/${m.file.id}`;
    if (m.file.mime === "application/pdf")
      return (
        <>
          <iframe src={src} title={m.title} className="hidden h-[75vh] w-full rounded-lg border border-slate-200 bg-slate-50 md:block" />
          <p className="text-sm text-slate-600 md:hidden">Tap <strong>Open</strong> to read the PDF on your phone.</p>
        </>
      );
    if (m.file.mime === "video/mp4") return <video src={src} controls preload="metadata" className="w-full rounded-lg bg-black" />;
    // eslint-disable-next-line @next/next/no-img-element
    if (m.file.mime.startsWith("image/")) return <img src={src} alt={m.title} className="max-h-[75vh] w-auto rounded-lg border border-slate-200" />;
    return (
      <p className="text-sm text-slate-600">
        {m.format === "slides" ? "This PowerPoint opens in PowerPoint, Keynote or Google Slides." : "This file opens in its app."} Use <strong>Download</strong> to view it.
      </p>
    );
  }
  const embed = m.url ? embedUrl(m.url, m.format) : null;
  if (!embed) return <p className="text-sm text-slate-600">This link opens on its own website. Use <strong>Open</strong> to view it.</p>;
  return (
    <iframe
      src={embed}
      title={m.title}
      className={cn("w-full rounded-lg border border-slate-200 bg-slate-50", m.format === "video" ? "aspect-video" : "h-[60vh] md:h-[75vh]")}
      allow="fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}

export function MaterialCard({ m, open, deleteAction }: { m: MaterialItem; open?: boolean; deleteAction?: () => Promise<void> }) {
  const Icon = formatIcon(m.format);
  let host = "";
  if (m.url) try { host = new URL(m.url).hostname.replace(/^www\./, ""); } catch {}
  return (
    <details open={open} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className={cn("flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden", focusRing)}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{m.title}</span>
          <span className="block truncate text-xs text-slate-500">
            {formatLabel(m.format)} · {m.file ? formatSize(m.file.size) : host}
          </span>
        </span>
        <span className="hidden shrink-0 text-xs font-medium text-brand-700 sm:inline">
          <span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4">
        <Preview m={m} />
        <div className="flex flex-wrap items-center gap-2">
          <a href={hrefOf(m)} target="_blank" rel="noopener noreferrer" className={linkBtn}>
            <ExternalLink className="size-4" aria-hidden /> Open<span className="sr-only"> {m.title} in a new tab</span>
          </a>
          {m.file && (
            <a href={`/api/files/${m.file.id}?download=1`} className={linkBtn}>
              <Download className="size-4" aria-hidden /> Download
            </a>
          )}
          {deleteAction && (
            <form action={deleteAction} className="ml-auto">
              <ConfirmButton message={`Remove "${m.title}" from this module?`} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-rose-700 hover:bg-rose-50", focusRing)}>
                <Trash2 className="size-4" aria-hidden /> Remove
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </details>
  );
}

export type AttachmentItem = { id: string; title: string; kind: string; format: string; url: string | null; file: FileInfo };

/** Files and links a student handed in. Videos and images play inline for the teacher. */
export function AttachmentList({ items, removeAction }: { items: AttachmentItem[]; removeAction?: (id: string) => () => Promise<void> }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((a) => {
        const Icon = formatIcon(a.format);
        const href = hrefOf(a);
        return (
          <li key={a.id} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-3 px-3 py-2">
              <Icon className="size-5 shrink-0 text-slate-500" aria-hidden />
              <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-brand-700 hover:underline">
                {a.title}<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className="shrink-0 text-xs text-slate-500">{a.file ? formatSize(a.file.size) : formatLabel(a.format)}</span>
              {a.file && (
                <a href={`${href}?download=1`} aria-label={`Download ${a.title}`} className={cn("flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100", focusRing)}>
                  <Download className="size-4" aria-hidden />
                </a>
              )}
              {removeAction && (
                <form action={removeAction(a.id)}>
                  <ConfirmButton message={`Remove "${a.title}" from your submission?`} aria-label={`Remove ${a.title}`}
                    className={cn("flex size-9 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600", focusRing)}>
                    <Trash2 className="size-4" aria-hidden />
                  </ConfirmButton>
                </form>
              )}
            </div>
            {a.file?.mime === "video/mp4" && (
              <div className="px-3 pb-3"><video src={href} controls preload="metadata" className="max-h-96 w-full rounded-md bg-black" /></div>
            )}
            {a.file?.mime.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="px-3 pb-3"><img src={href} alt={a.title} className="max-h-96 rounded-md border border-slate-200" /></div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
