// Creates a module (optionally) and attaches a learning material: an uploaded file or a link.
// A route handler instead of a server action so large files (up to MAX_UPLOAD_MB) can be sent with progress.
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/csrf";
import { z } from "zod";
import { db } from "@/lib/db";
import { canAccessCourse, getCurrentUser } from "@/lib/auth";
import { MAX_UPLOAD_MB, deleteStoredFile, formatFromUrl, readUpload, saveFile } from "@/lib/storage";

export const runtime = "nodejs";

/** Largest whole request accepted, checked before reading it into memory. */
const MAX_REQUEST_BYTES = (MAX_UPLOAD_MB * 1 + 1) * 1024 * 1024;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const urlSchema = z.string().url().refine((u) => /^https?:\/\//i.test(u));

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "STUDENT") return NextResponse.json({ message: "Not allowed." }, { status: 403 });

  if (!sameOrigin(req)) return NextResponse.json({ message: "This request came from another website and was blocked." }, { status: 403 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_REQUEST_BYTES)
    return NextResponse.json({ message: `That's too much to upload at once (limit ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024) - 1} MB). Share big files as links instead.` }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ message: `The upload didn't arrive. Files can be up to ${MAX_UPLOAD_MB} MB.` }, { status: 400 });
  }
  const courseId = str(form.get("courseId"));
  if (!(await canAccessCourse(user, courseId)).canManage) return NextResponse.json({ message: "You can't edit this course." }, { status: 403 });

  const errors: Record<string, string> = {};
  let moduleId = str(form.get("moduleId"));
  const title = str(form.get("title"));
  const description = str(form.get("description"));
  if (moduleId) {
    if (!(await db.module.findFirst({ where: { id: moduleId, courseId }, select: { id: true } }))) return NextResponse.json({ message: "Module not found." }, { status: 404 });
  } else {
    if (title.length < 2) errors.title = "Give the module a title.";
    if (title.length > 200) errors.title = "Keep the title under 200 characters.";
    if (description.length > 20_000) errors.description = "The description is too long.";
  }

  const source = str(form.get("source")) || "none";
  const materialTitle = str(form.get("materialTitle")).slice(0, 200);
  let upload: Awaited<ReturnType<typeof readUpload>> | null = null;
  let url = "";
  if (source === "file") {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) errors.file = "Choose a file to upload.";
    else {
      upload = await readUpload(file);
      if ("error" in upload) errors.file = upload.error;
    }
  } else if (source === "link") {
    url = str(form.get("url"));
    if (!urlSchema.safeParse(url).success) errors.url = "Paste a full link starting with https://";
  }
  if (Object.keys(errors).length) return NextResponse.json({ errors, message: "Some details need fixing." }, { status: 400 });

  if (!moduleId) {
    const last = await db.module.findFirst({ where: { courseId }, orderBy: { position: "desc" }, select: { position: true } });
    moduleId = (await db.module.create({ data: { courseId, title, description, position: (last?.position ?? -1) + 1 } })).id;
  }
  const position = await db.material.count({ where: { moduleId } });

  if (upload && !("error" in upload)) {
    const key = await saveFile(upload.bytes, upload.name);
    try {
      const stored = await db.storedFile.create({
        data: { schoolId: user.schoolId, courseId, uploadedById: user.id, name: upload.name, mime: upload.mime, size: upload.bytes.length, storageKey: key },
      });
      await db.material.create({
        data: { moduleId, kind: "FILE", format: upload.format, fileId: stored.id, position, title: materialTitle || upload.name.replace(/\.[^.]+$/, "") },
      });
    } catch (e) {
      await deleteStoredFile(key);
      throw e;
    }
  } else if (url) {
    let fallback = url;
    try {
      fallback = new URL(url).hostname.replace(/^www\./, "");
    } catch {}
    await db.material.create({ data: { moduleId, kind: "LINK", url, format: formatFromUrl(url), position, title: materialTitle || fallback } });
  }

  return NextResponse.json({ ok: true, moduleId, url: `/courses/${courseId}/modules/${moduleId}` });
}
