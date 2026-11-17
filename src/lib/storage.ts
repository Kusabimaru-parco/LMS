// Uploaded files (lesson PDFs, slides, student work).
// Two drivers, chosen with STORAGE_DRIVER:
//   "local" (default): the server's disk under UPLOAD_DIR. Docker mounts a volume there.
//   "s3": any S3-compatible bucket (Supabase Storage, Cloudflare R2, AWS S3, MinIO…). Needed on
//         Vercel and other serverless hosts, whose disks are wiped between requests.
// Files are always served through /api/files/[id], which checks who may see them; buckets stay private.
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AwsClient } from "aws4fetch";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"));
/** Serverless hosts limit request bodies (Vercel: 4.5 MB), so the default there is lower. */
export const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || (process.env.VERCEL ? 4 : 50));
export const STORAGE_DRIVER = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";

export type Format = "pdf" | "slides" | "doc" | "sheet" | "image" | "video" | "other";

/** Extensions teachers may upload, with the MIME type we serve them as and a magic-byte check. */
const TYPES: Record<string, { mime: string; format: Format; magic?: "pdf" | "zip" | "ole" | "png" | "jpg" }> = {
  pdf: { mime: "application/pdf", format: "pdf", magic: "pdf" },
  ppt: { mime: "application/vnd.ms-powerpoint", format: "slides", magic: "ole" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", format: "slides", magic: "zip" },
  odp: { mime: "application/vnd.oasis.opendocument.presentation", format: "slides", magic: "zip" },
  doc: { mime: "application/msword", format: "doc", magic: "ole" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", format: "doc", magic: "zip" },
  odt: { mime: "application/vnd.oasis.opendocument.text", format: "doc", magic: "zip" },
  xls: { mime: "application/vnd.ms-excel", format: "sheet", magic: "ole" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", format: "sheet", magic: "zip" },
  png: { mime: "image/png", format: "image", magic: "png" },
  jpg: { mime: "image/jpeg", format: "image", magic: "jpg" },
  jpeg: { mime: "image/jpeg", format: "image", magic: "jpg" },
  mp4: { mime: "video/mp4", format: "video" },
  txt: { mime: "text/plain", format: "doc" },
};
export const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");

const MAGIC: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  zip: [0x50, 0x4b, 0x03, 0x04],
  ole: [0xd0, 0xcf, 0x11, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47],
  jpg: [0xff, 0xd8, 0xff],
};

export function extOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

/** Checks the type and size of an uploaded file. Returns the bytes and served MIME type, or an error message. */
export async function readUpload(file: File): Promise<{ bytes: Buffer; mime: string; format: Format; name: string } | { error: string }> {
  const ext = extOf(file.name);
  const type = TYPES[ext];
  if (!type) return { error: "Upload a PDF, PowerPoint, Word, Excel, image or MP4 file." };
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return { error: `Files can be up to ${MAX_UPLOAD_MB} MB. Try compressing it, or share it as a link.` };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (type.magic && !MAGIC[type.magic].every((b, i) => bytes[i] === b)) return { error: `That file doesn't look like a real .${ext} file.` };
  const name = file.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(-150);
  return { bytes, mime: type.mime, format: type.format, name };
}

/* ---------------- S3-compatible driver ---------------- */

let s3: { client: AwsClient; base: string } | null = null;
function s3Client() {
  if (s3) return s3;
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
    throw new Error("STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  s3 = {
    client: new AwsClient({ accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY, service: "s3", region: process.env.S3_REGION || "auto" }),
    base: `${S3_ENDPOINT.replace(/\/+$/, "")}/${encodeURIComponent(S3_BUCKET)}`,
  };
  return s3;
}
const s3Url = (key: string) => `${s3Client().base}/${key.split("/").map(encodeURIComponent).join("/")}`;

async function s3Request(key: string, init: RequestInit & { headers?: Record<string, string> }) {
  const { client } = s3Client();
  return client.fetch(s3Url(key), { ...init, signal: AbortSignal.timeout(60_000) });
}

/* ---------------- Public API (both drivers) ---------------- */

/** Stores the bytes under a new random key and returns the key. */
export async function saveFile(bytes: Buffer, name: string) {
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomBytes(16).toString("hex")}.${extOf(name) || "bin"}`;
  if (STORAGE_DRIVER === "s3") {
    const r = await s3Request(key, { method: "PUT", body: new Uint8Array(bytes), headers: { "Content-Type": "application/octet-stream" } });
    if (!r.ok) throw new Error(`Storage upload failed (${r.status})`);
    return key;
  }
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: "wx" });
  return key;
}

export function resolveKey(key: string) {
  const full = path.resolve(UPLOAD_DIR, key);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function readStoredFile(key: string) {
  if (STORAGE_DRIVER === "s3") {
    const r = await s3Request(key, { method: "GET" });
    if (!r.ok) throw new Error(`Storage read failed (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
  return readFile(resolveKey(key));
}

/** Size of a stored file, or null if it's missing. */
export async function storedFileSize(key: string) {
  try {
    if (STORAGE_DRIVER === "s3") {
      const r = await s3Request(key, { method: "HEAD" });
      return r.ok ? Number(r.headers.get("content-length") ?? 0) : null;
    }
    return (await stat(resolveKey(key))).size;
  } catch {
    return null;
  }
}

/** Streams (part of) a stored file without loading it all into memory. `end` is inclusive. */
export async function streamStoredFile(key: string, start?: number, end?: number): Promise<ReadableStream<Uint8Array>> {
  if (STORAGE_DRIVER === "s3") {
    const range = start != null ? { Range: `bytes=${start}-${end ?? ""}` } : undefined;
    const r = await s3Request(key, { method: "GET", headers: range });
    if (!r.ok || !r.body) throw new Error(`Storage read failed (${r.status})`);
    return r.body as ReadableStream<Uint8Array>;
  }
  return Readable.toWeb(createReadStream(resolveKey(key), { start, end })) as ReadableStream<Uint8Array>;
}

export async function deleteStoredFile(key: string) {
  if (STORAGE_DRIVER === "s3") {
    await s3Request(key, { method: "DELETE" }).catch(() => {});
    return;
  }
  await rm(resolveKey(key), { force: true });
}

/** Write, read back and delete a small file: used by the BaaS setup script and the system check. */
export async function storageSelfTest() {
  const key = await saveFile(Buffer.from("campus-lms storage test"), "test.txt");
  const back = (await readStoredFile(key)).toString("utf8");
  await deleteStoredFile(key);
  return back === "campus-lms storage test";
}

/** Guess what a link points to, so it can be shown with the right icon and viewer. */
export function formatFromUrl(url: string): Format {
  const u = url.toLowerCase();
  if (/docs\.google\.com\/presentation|\.pptx?(\?|#|$)|\.odp(\?|#|$)|canva\.com\/design/.test(u)) return "slides";
  if (/\.pdf(\?|#|$)/.test(u)) return "pdf";
  if (/docs\.google\.com\/document|\.docx?(\?|#|$)/.test(u)) return "doc";
  if (/docs\.google\.com\/spreadsheets|\.xlsx?(\?|#|$)/.test(u)) return "sheet";
  if (/youtube\.com|youtu\.be|vimeo\.com|\.mp4(\?|#|$)/.test(u)) return "video";
  if (/\.(png|jpe?g|gif|webp)(\?|#|$)/.test(u)) return "image";
  return "other";
}

/**
 * An embeddable viewer URL for a linked material, when the host allows it.
 * Uploaded PDFs are shown directly from /api/files; uploaded PowerPoints need to be downloaded
 * (online viewers can't reach a school's private server).
 */
export function embedUrl(url: string, format: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const g = u.pathname.match(/^\/(presentation|document|spreadsheets)\/d\/([\w-]+)/);
  if (host === "docs.google.com" && g) return `https://docs.google.com/${g[1]}/d/${g[2]}/${g[1] === "presentation" ? "embed" : "preview"}`;
  const drive = u.pathname.match(/^\/file\/d\/([\w-]+)/);
  if (host === "drive.google.com" && drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
  if (host === "youtube.com" && u.searchParams.get("v")) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}`;
  if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname}`;
  if (host === "canva.com" && u.pathname.includes("/design/")) return url.includes("embed") ? url : `${u.origin}${u.pathname.replace(/\/(edit|view)$/, "")}/view?embed`;
  if (format === "slides" || format === "doc" || format === "sheet") {
    if (/\.(pptx?|docx?|xlsx?)$/i.test(u.pathname)) return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }
  if (format === "pdf") return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  return null;
}

export function formatLabel(format: string) {
  return { pdf: "PDF", slides: "Slides", doc: "Document", sheet: "Spreadsheet", image: "Image", video: "Video" }[format] ?? "Link";
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
