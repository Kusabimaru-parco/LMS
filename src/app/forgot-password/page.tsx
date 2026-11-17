import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SimpleForm } from "@/components/simple-form";
import { requestPasswordReset } from "@/app/actions";
import { isSetupComplete } from "@/lib/settings";

export const metadata: Metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  if (!(await isSetupComplete())) redirect("/setup");
  return (
    <AuthShell title="Forgot your password?" description="Enter your school email and we'll send you a link to choose a new one.">
      <SimpleForm
        action={requestPasswordReset}
        submitLabel="Send reset link"
        pendingLabel="Sending…"
        className="[&_button[type=submit]]:w-full"
        fields={[{ name: "email", label: "Email", type: "email", required: true, autoComplete: "username", placeholder: "you@school.edu" }]}
      />
      <p className="mt-6 text-center text-sm text-slate-600">
        Remembered it? <Link href="/login" className="font-medium text-brand-700 hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
