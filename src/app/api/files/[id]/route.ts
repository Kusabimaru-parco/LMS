// Serves an uploaded file to people allowed to see it.
// Course materials: anyone in the course. Student submissions: the student and the course's teachers.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessCourse, getCurrentUser } from "@/lib/auth";
import { storedFileSize, streamStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "video/mp4", "text/plain"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in to view this file.", { status: 401 });
  const { id } = await params;
  const file = await db.storedFile.findUnique({
    where: { id },
    include: { attachment: { select: { submission: { select: { studentId: true } } } } },
  });
  if (!file || file.schoolId !== user.schoolId) return new NextResponse("File not found.", { status: 404 });
  if (file.courseId) {
    const access = await canAccessCourse(user, file.courseId);
    const ownerOnly = file.attachment ? file.attachment.submission.studentId === user.id : true;
    if (!(access.canManage || (access.canView && ownerOnly))) return new NextResponse("File not found.", { status: 404 });
  }

  const size = await storedFileSize(file.storageKey);
  if (size == null) return new NextResponse("This file is missing from the server. Ask for it to be uploaded again.", { status: 410 });

  const download = new URL(req.url).searchParams.has("download") || !INLINE.has(file.mime);
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    // Never let the browser reuse a copy without asking the server: school lab computers are shared,
    // and the next person signed in must not see someone else's file from the cache.
    "Cache-Control": file.attachment ? "private, no-store" : "private, no-cache",
    Vary: "Cookie",
    "Accept-Ranges": "bytes",
  };

  // Range requests let videos seek without downloading the whole file first.
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new NextResponse(await streamStoredFile(file.storageKey, start, end), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(await streamStoredFile(file.storageKey), { headers: { ...headers, "Content-Length": String(size) } });
}
