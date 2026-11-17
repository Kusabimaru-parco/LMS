// Web app manifest: lets students and teachers "Add to home screen" and open the LMS like an app.
import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const school = await db.school.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true, brandColor: true } }).catch(() => null);
  const name = school?.name ?? "Campus LMS";
  return {
    name,
    short_name: name.length > 12 ? name.split(" ").map((w) => w[0]).join("").slice(0, 6) || "LMS" : name,
    description: `${name} learning platform`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: school?.brandColor ?? "#4f46e5",
    icons: [
      { src: "/api/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
