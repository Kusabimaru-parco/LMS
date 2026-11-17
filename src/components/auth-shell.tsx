// Centered, school-branded layout for sign-in related pages (forgot / reset / change password).
import type { CSSProperties, ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { db } from "@/lib/db";
import { logoUrl } from "@/lib/school";

export async function AuthShell({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const school = await db.school.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true, brandColor: true, logoUpdatedAt: true } });
  const logo = school ? logoUrl(school) : null;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12" style={{ "--brand": school?.brandColor ?? "#4f46e5" } as CSSProperties}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5 text-lg font-semibold text-slate-900">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-10 rounded-lg object-contain" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-lg bg-brand-600 text-white"><GraduationCap className="size-5" aria-hidden /></span>
          )}
          {school?.name ?? "Campus LMS"}
        </div>
        <main className="animate-rise rounded-3xl border border-slate-200/90 bg-white p-6 shadow-md sm:p-9">
          <h1 className="font-display text-2xl font-semibold text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
