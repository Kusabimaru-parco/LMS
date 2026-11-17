// App icon for "Add to home screen" (PWA), drawn in the school's brand colour with its initials.
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { initials } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = (await params).size === "512" ? 512 : (await params).size === "180" ? 180 : 192;
  const school = await db.school.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true, brandColor: true } }).catch(() => null);
  const color = school?.brandColor && /^#[0-9a-f]{6}$/i.test(school.brandColor) ? school.brandColor : "#4f46e5";
  const text = initials(school?.name ?? "Campus LMS").slice(0, 2) || "LMS";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: color, color: "white", fontSize: size * 0.4, fontWeight: 700, letterSpacing: -2 }}>
        {text}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
