// School profile: shared validation and logo handling for the setup wizard and admin settings.
import { z } from "zod";

const optional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const schoolSchema = z.object({
  name: z.string().trim().min(2, "School name is required.").max(120),
  address: optional(300),
  phone: optional(40),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email address."),
  website: optional(200),
  timezone: z.string().trim().min(1, "Choose a timezone.").refine(isValidTimezone, "Choose a valid timezone."),
  academicYear: optional(40),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #4f46e5."),
});

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const LOGO_MAX_BYTES = 1024 * 1024;

/** Validates an uploaded logo. Returns null when no file was chosen. SVG is refused (it can contain scripts). */
export async function readLogo(file: FormDataEntryValue | null): Promise<{ bytes: Buffer; mime: string } | { error: string } | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (!LOGO_TYPES.includes(file.type)) return { error: "Upload a PNG, JPG or WebP image." };
  if (file.size > LOGO_MAX_BYTES) return { error: "The logo must be smaller than 1 MB." };
  return { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type };
}

export const logoUrl = (s: { logoUpdatedAt: Date | null }) =>
  s.logoUpdatedAt ? `/api/school/logo?v=${s.logoUpdatedAt.getTime()}` : null;
