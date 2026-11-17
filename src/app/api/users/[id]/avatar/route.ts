// Profile pictures, for signed-in people of the same school only.
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  const u = await db.user.findFirst({ where: { id, schoolId: me.schoolId }, select: { avatar: true, avatarMime: true } });
  if (!u?.avatar || !u.avatarMime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(u.avatar), {
    headers: {
      "Content-Type": u.avatarMime,
      // URLs carry ?v=<updatedAt>. Private: only this browser may keep a copy.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
