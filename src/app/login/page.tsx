import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookOpen, CheckCircle2, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { LoginForm } from "./login-form";
import { demoLogin } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { logoUrl } from "@/lib/school";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: BookOpen, text: "Courses, lessons and assignments in one place" },
  { icon: CheckCircle2, text: "Grades and feedback as soon as work is marked" },
  { icon: Users, text: "For administrators, teachers and students, on any device" },
  { icon: ShieldCheck, text: "Your school's data stays on your school's server" },
];

function Mark({ logo, className }: { logo: string | null; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (logo) return <img src={logo} alt="" className={`${className} object-contain`} />;
  return (
    <span className={`${className} flex items-center justify-center bg-brand-600 text-white`}>
      <GraduationCap className="size-5" aria-hidden />
    </span>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const { next } = await searchParams;
  const school = await db.school.findFirst({
    orderBy: { createdAt: "asc" },
    select: { name: true, brandColor: true, logoUpdatedAt: true },
  });
  const name = school?.name ?? "Campus LMS";
  const logo = school ? logoUrl(school) : null;
  const demo = process.env.DEMO_MODE === "true";

  return (
    <div className="grid min-h-dvh lg:grid-cols-2" style={{ "--brand": school?.brandColor ?? "#4f46e5" } as CSSProperties}>
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-brand-500/40 blur-3xl" />
        <div className="relative flex items-center gap-3 text-lg font-semibold">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-11 rounded-xl bg-white object-contain p-1" />
          ) : (
            <span className="flex size-11 items-center justify-center rounded-xl bg-white/15">
              <GraduationCap className="size-6" aria-hidden />
            </span>
          )}
          {name}
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Learning that works for everyone at {name}.</h2>
          <ul className="mt-8 space-y-4 text-brand-50">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <Icon className="size-5 shrink-0 text-white" aria-hidden />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-100">Powered by Campus LMS</p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 text-lg font-semibold text-slate-900 lg:hidden">
            <Mark logo={logo} className="size-10 rounded-lg" />
            {name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in with your school account to continue.</p>

          <div className="mt-8">
            <LoginForm next={next} />
          </div>

          {demo && (
            <section aria-labelledby="demo-title" className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-4">
              <h2 id="demo-title" className="text-sm font-semibold text-slate-900">Explore the demo</h2>
              <p className="mt-0.5 text-xs text-slate-500">Sign in instantly as a sample user.</p>
              <form action={demoLogin} className="mt-3 grid grid-cols-3 gap-2">
                <SubmitButton variant="secondary" name="role" value="ADMIN" pendingText="…" className="px-2">Admin</SubmitButton>
                <SubmitButton variant="secondary" name="role" value="TEACHER" pendingText="…" className="px-2">Teacher</SubmitButton>
                <SubmitButton variant="secondary" name="role" value="STUDENT" pendingText="…" className="px-2">Student</SubmitButton>
              </form>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
