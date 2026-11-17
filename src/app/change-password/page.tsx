import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SimpleForm } from "@/components/simple-form";
import { changePassword, logout } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose your password" };
export const dynamic = "force-dynamic";

/** Shown right after signing in with a temporary password. */
export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/signout");
  if (!user.mustChangePassword) redirect("/account");
  return (
    <AuthShell
      title={`Welcome, ${user.name.split(" ")[0]}`}
      description="You signed in with a temporary password. Choose your own password to continue. Only you will know it."
    >
      <SimpleForm
        action={changePassword}
        submitLabel="Save and continue"
        pendingLabel="Saving…"
        className="[&_button[type=submit]]:w-full"
        fields={[
          { name: "password", label: "New password", type: "password", required: true, autoComplete: "new-password", hint: "At least 8 characters, with a letter and a number." },
          { name: "confirm", label: "Confirm new password", type: "password", required: true, autoComplete: "new-password" },
        ]}
      />
      <form action={logout} className="mt-4 text-center">
        <button type="submit" className="text-sm text-slate-500 hover:text-slate-900 hover:underline">Sign out</button>
      </form>
    </AuthShell>
  );
}
