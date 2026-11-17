import type { Metadata } from "next";
import { CheckCircle2, CircleOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getSsoForm, redirectUri } from "@/lib/sso";
import { getBaseUrl } from "@/lib/url";
import { saveSsoSettings } from "@/app/admin-actions";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { SimpleForm } from "@/components/simple-form";
import { CopyValue } from "@/components/copy-value";

export const metadata: Metadata = { title: "Sign-in settings" };

export default async function SignInSettingsPage() {
  await requireUser(["ADMIN"]);
  const [cfg, base] = await Promise.all([getSsoForm(), getBaseUrl()]);
  const https = base.startsWith("https://");
  const providers = [
    {
      id: "google" as const,
      title: "Sign in with Google",
      steps: [
        "Open console.cloud.google.com → APIs & Services → Credentials (use your school's Google Workspace account).",
        "Create credentials → OAuth client ID → Web application.",
        "Add the redirect URI below under Authorized redirect URIs, then save.",
        "Copy the Client ID and Client secret here.",
      ],
    },
    {
      id: "microsoft" as const,
      title: "Sign in with Microsoft",
      steps: [
        "Open entra.microsoft.com → App registrations → New registration.",
        "Choose Web as the platform and add the redirect URI below.",
        "Under Certificates & secrets, create a client secret.",
        "Copy the Application (client) ID, the secret value and your Directory (tenant) ID here.",
      ],
    },
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="School settings" description="Let people sign in with their school Google or Microsoft account. Passwords keep working too." />
      <SettingsTabs current="/admin/settings/sign-in" />
      <p className="mb-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Only people who already have an account here can sign in, matched by email address. Nobody new can get in this way.
        {!https && " Google and Microsoft require the site to use HTTPS with a real domain (localhost works for testing)."}
      </p>
      <div className="space-y-6">
        {providers.map((p) => {
          const c = cfg[p.id];
          const on = !!c.clientId && c.hasSecret;
          return (
            <Card key={p.id}>
              <CardHeader title={p.title} action={on
                ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-4" aria-hidden />On</span>
                : <span className="inline-flex items-center gap-1.5 text-sm text-slate-500"><CircleOff className="size-4" aria-hidden />Off</span>} />
              <div className="space-y-5 p-5">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                <div className="min-w-0">
                  <p className="mb-1.5 text-sm font-medium text-slate-800">Redirect URI</p>
                  <div className="overflow-x-auto rounded-lg bg-slate-50 p-2"><CopyValue value={redirectUri(base, p.id)} /></div>
                </div>
                <SimpleForm
                  action={saveSsoSettings.bind(null, p.id)}
                  submitLabel="Save"
                  fields={[
                    { name: "clientId", label: p.id === "google" ? "Client ID" : "Application (client) ID", defaultValue: c.clientId, autoComplete: "off", hint: "Leave empty to turn this off." },
                    { name: "clientSecret", label: "Client secret", type: "password", autoComplete: "off", placeholder: c.hasSecret ? "••••••••" : "", hint: c.hasSecret ? "Saved and encrypted. Leave empty to keep it." : "Stored encrypted." },
                    ...(p.id === "microsoft" ? [{ name: "tenant", label: "Directory (tenant) ID", defaultValue: c.tenant, placeholder: "e.g. 1a2b3c… or yourschool.onmicrosoft.com", hint: "Only accounts from your school's tenant can sign in. Empty = any work or school account." }] : []),
                  ]}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
