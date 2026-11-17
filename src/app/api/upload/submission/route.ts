// A student hands in (or updates) an assignment: written answer, uploaded files and links.
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/csrf";
import { z } from "zod";
import { db } from "@/lib/db";
import { canAccessCourse, getCurrentUser } from "@/lib/auth";
import { MAX_UPLOAD_MB, deleteStoredFile, formatFromUrl, readUpload, saveFile } from "@/lib/storage";

export const runtime = "nodejs";

/** Largest whole request accepted, checked before reading it into memory. */
const MAX_REQUEST_BYTES = (MAX_UPLOAD_MB * 2 + 1) * 1024 * 1024;

const MAX_ATTACHMENTS = 10;
const linksSchema = z
  .array(z.object({ url: z.string().trim().url().refine((u) => /^https?:\/\//i.test(u)), title: z.string().trim().max(200).default("") }))
  .max(MAX_ATTACHMENTS);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "STUDENT") return NextResponse.json({ message: "Only students can hand in work." }, { status: 403 });

  if (!sameOrigin(req)) return NextResponse.json({ message: "This request came from another website and was blocked." }, { status: 403 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_REQUEST_BYTES)
    return NextResponse.json({ message: `That's too much to upload at once (limit ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024) - 1} MB). Share big files as links instead.` }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ message: `The upload didn't arrive. Files can be up to ${MAX_UPLOAD_MB} MB each. For bigger files, share a link instead.` }, { status: 400 });
  }
  const assignmentId = String(form.get("assignmentId") ?? "");
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, courseId: true } });
  if (!assignment || !(await canAccessCourse(user, assignment.courseId)).canView)
    return NextResponse.json({ message: "You're not enrolled in this course." }, { status: 403 });

  const existing = await db.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
    include: { _count: { select: { attachments: true } } },
  });
  if (existing?.gradedAt) return NextResponse.json({ message: "This work has already been graded and can't be changed." }, { status: 409 });

  const content = String(form.get("content") ?? "").trim().slice(0, 50_000);
  const errors: Record<string, string> = {};
  let links: z.infer<typeof linksSchema> = [];
  try {
    const parsed = linksSchema.safeParse(JSON.parse(String(form.get("links") ?? "[]")));
    if (parsed.success) links = parsed.data;
    else errors.links = "One of the links isn't valid. Paste full links starting with https://";
  } catch {
    errors.links = "One of the links isn't valid.";
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const uploads: { bytes: Buffer; mime: string; format: string; name: string }[] = [];
  for (const f of files) {
    const r = await readUpload(f);
    if ("error" in r) {
      errors.files = f.size > MAX_UPLOAD_MB * 1024 * 1024
        ? `"${f.name}" is too big (limit ${MAX_UPLOAD_MB} MB). Upload it to Google Drive, OneDrive or YouTube and add the share link instead.`
        : `"${f.name}": ${r.error}`;
      break;
    }
    uploads.push(r);
  }
  const total = (existing?._count.attachments ?? 0) + uploads.length + links.length;
  if (total > MAX_ATTACHMENTS) errors.files = `You can attach up to ${MAX_ATTACHMENTS} files and links.`;
  if (!content && total === 0) errors.content = "Write an answer, or attach a file or link.";
  if (Object.keys(errors).length) return NextResponse.json({ errors, message: "Your work wasn't handed in yet." }, { status: 400 });

  const submission = await db.submission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
    update: { content, submittedAt: new Date() },
    create: { assignmentId, studentId: user.id, content },
  });

  const saved: string[] = [];
  try {
    for (const u of uploads) {
      const key = await saveFile(u.bytes, u.name);
      saved.push(key);
      const stored = await db.storedFile.create({
        data: { schoolId: user.schoolId, courseId: assignment.courseId, uploadedById: user.id, name: u.name, mime: u.mime, size: u.bytes.length, storageKey: key },
      });
      await db.submissionAttachment.create({ data: { submissionId: submission.id, kind: "FILE", title: u.name, format: u.format, fileId: stored.id } });
    }
    for (const l of links) {
      let title = l.title;
      if (!title) try { title = new URL(l.url).hostname.replace(/^www\./, ""); } catch { title = "Link"; }
      await db.submissionAttachment.create({ data: { submissionId: submission.id, kind: "LINK", title, url: l.url, format: formatFromUrl(l.url) } });
    }
  } catch (e) {
    await Promise.all(saved.map(deleteStoredFile));
    throw e;
  }

  return NextResponse.json({ ok: true, message: existing ? "Your submission was updated." : "Your work was handed in." });
}
