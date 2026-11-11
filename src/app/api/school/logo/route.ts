import { db } from "@/lib/db";

// Serves the school logo from the database (works on every host, no file storage needed).
export async function GET() {
  const school = await db.school.findFirst({ orderBy: { createdAt: "asc" }, select: { logo: true, logoMime: true } });
  if (!school?.logo || !school.logoMime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(school.logo), {
    headers: {
      "Content-Type": school.logoMime,
      // URLs carry ?v=<updatedAt>, so the image can be cached for a long time.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
