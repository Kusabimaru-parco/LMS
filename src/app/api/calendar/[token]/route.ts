// Personal calendar feed. The token in the URL is the only credential (calendar apps can't sign in),
// so it is long and random, and can be replaced from My account.
import { db } from "@/lib/db";
import { buildCalendar } from "@/lib/ics";
import { getBaseUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (token.length < 32) return new Response("Not found", { status: 404 });
  const user = await db.user.findUnique({
    where: { calendarToken: token },
    select: { id: true, name: true, email: true, role: true, gradeLevel: true, schoolId: true, school: true, mustChangePassword: true, passwordChangedAt: true },
  });
  if (!user) return new Response("Not found", { status: 404 });
  const ics = await buildCalendar(user as never, await getBaseUrl());
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="campus-lms.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
