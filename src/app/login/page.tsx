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
import { enabledProviders, PROVIDERS } from "@/lib/sso";
import { patternStyle } from "@/lib/patterns";

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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; sso?: string; expired?: string }> }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const { next, sso, expired } = await searchParams;
  const providers = await enabledProviders();
  const ssoMessage = {
    "no-account": "There's no account for that email at this school. Sign in with the email your school gave you, or ask the office.",
    failed: "Signing in didn't work. Please try again.",
    cancelled: "Sign-in was cancelled.",
    off: "That sign-in option isn't turned on.",
  }[sso ?? ""] ?? (expired ? "Your session ended. Please sign in again." : undefined);
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
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={patternStyle(name)} />
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-24 right-16 size-40 rotate-12 rounded-[3rem] border-2 border-white/25" />
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
          <h2 className="font-display text-5xl font-semibold leading-[1.08]">Learning that works for everyone at <span className="italic">{name}</span>.</h2>
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
        <div className="w-full max-w-md animate-rise rounded-3xl border border-slate-200/90 bg-white p-6 shadow-md sm:p-9">
          <div className="mb-8 flex items-center gap-2.5 text-lg font-semibold text-slate-900 lg:hidden">
            <Mark logo={logo} className="size-10 rounded-lg" />
            {name}
          </div>
          <h1 className="font-display text-3xl font-semibold text-slate-900"><span className="marker">Welcome back</span></h1>
          <p className="mt-1 text-sm text-slate-600">Sign in with your school account to continue.</p>

          {ssoMessage && <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{ssoMessage}</p>}

          {providers.length > 0 && (
            <div className="mt-8 space-y-2">
              {providers.map((p) => (
                <a key={p} href={`/api/auth/sso/${p}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
                  <ProviderMark provider={p} />Continue with {PROVIDERS.find((x) => x.id === p)?.label}
                </a>
              ))}
              <p className="flex items-center gap-3 pt-2 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200" />or use your password<span className="h-px flex-1 bg-slate-200" /></p>
            </div>
          )}

          <div className={providers.length ? "mt-4" : "mt-8"}>
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

/** Simple provider marks drawn with basic shapes (no external images). */
function ProviderMark({ provider }: { provider: string }) {
  if (provider === "microsoft") {
    return (
      <svg aria-hidden viewBox="0 0 20 20" className="size-4"><rect width="9" height="9" fill="#f25022" /><rect x="11" width="9" height="9" fill="#7fba00" /><rect y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4"><circle cx="10" cy="10" r="9" fill="none" stroke="#4285f4" strokeWidth="2.5" /><path d="M10 10h8" stroke="#4285f4" strokeWidth="2.5" /></svg>
  );
}
