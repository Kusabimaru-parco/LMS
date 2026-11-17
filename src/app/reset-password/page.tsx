import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SimpleForm } from "@/components/simple-form";
import { resetPassword } from "@/app/actions";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/passwords";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const row = token ? await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { usedAt: true, expiresAt: true, user: { select: { email: true } } } }) : null;
  const valid = row && !row.usedAt && row.expiresAt > new Date();

  if (!valid) {
    return (
      <AuthShell title="This link has expired" description="Reset links work once, for one hour.">
        <Link href="/forgot-password" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
          Send me a new link
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" description={<>For {row.user.email}. You'll be signed in afterwards, and signed out on other devices.</>}>
      <SimpleForm
        action={resetPassword.bind(null, token)}
        submitLabel="Save new password"
        pendingLabel="Saving…"
        className="[&_button[type=submit]]:w-full"
        fields={[
          { name: "password", label: "New password", type: "password", required: true, autoComplete: "new-password", hint: "At least 8 characters, with a letter and a number." },
          { name: "confirm", label: "Confirm new password", type: "password", required: true, autoComplete: "new-password" },
        ]}
      />
    </AuthShell>
  );
}
