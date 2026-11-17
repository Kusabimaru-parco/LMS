// "A new version is available" for administrators.
// UPDATE_FEED_URL points at a small JSON file published with every release (see docs/UPDATING.md):
//   { "version": "1.1.0", "date": "2027-01-15", "notes": "What's new…", "url": "https://…/releases/1.1.0", "security": false }
// Only the request itself reaches the vendor (no school data is sent). Leave the variable empty to turn it off.
import { z } from "zod";
import { APP_VERSION, compareVersions } from "./version";

const feedSchema = z.object({
  version: z.string().regex(/^v?\d+\.\d+\.\d+/),
  date: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
  url: z.string().url().refine((u) => u.startsWith("https://")).optional(),
  security: z.boolean().optional(),
});
export type Release = z.infer<typeof feedSchema>;

let cache: { at: number; release: Release | null } | null = null;

export async function availableUpdate(): Promise<Release | null> {
  const feed = process.env.UPDATE_FEED_URL;
  if (!feed || !feed.startsWith("https://")) return null;
  if (cache && Date.now() - cache.at < 12 * 3_600_000) return cache.release;
  let release: Release | null = null;
  try {
    const r = await fetch(feed, { signal: AbortSignal.timeout(5_000), headers: { Accept: "application/json", "User-Agent": `campus-lms/${APP_VERSION}` }, cache: "no-store" });
    const parsed = feedSchema.safeParse(await r.json());
    if (r.ok && parsed.success && compareVersions(parsed.data.version, APP_VERSION) > 0) release = parsed.data;
  } catch {
    release = null;
  }
  cache = { at: Date.now(), release };
  return release;
}
