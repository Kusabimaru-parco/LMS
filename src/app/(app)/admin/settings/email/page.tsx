import type { Metadata } from "next";
import { CheckCircle2, CircleOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getEmailConfigForForm } from "@/lib/email";
import { getSetting } from "@/lib/settings";
import { APP_URL_KEY, requestOrigin } from "@/lib/url";
import { saveEmailSettings, sendTestEmailAction } from "@/app/actions";
import { Card, PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { EmailSettingsForm } from "@/components/email-settings";

export const metadata: Metadata = { title: "Email settings" };

export default async function EmailSettingsPage() {
  await requireUser(["ADMIN"]);
  const [initial, saved, origin] = await Promise.all([getEmailConfigForForm(), getSetting(APP_URL_KEY), requestOrigin()]);
  const on = initial.provider !== "none";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="School settings" description="Email is used for welcome messages with temporary passwords and for password reset links." />
      <SettingsTabs current="/admin/settings/email" />
      <Card className="mb-6 flex items-start gap-3 p-4">
        {on ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> : <CircleOff className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />}
        <div className="text-sm">
          <p className="font-medium text-slate-900">{on ? "Email is on" : "Email is off"}</p>
          <p className="text-slate-600">
            {on
              ? "New people get their temporary password by email, and everyone can reset a forgotten password."
              : "Temporary passwords are shown to you on screen instead, and 'Forgot password' tells people to ask you."}
          </p>
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
        <EmailSettingsForm
          initial={initial}
          siteUrl={process.env.APP_URL || saved || origin || ""}
          saveAction={saveEmailSettings}
          testAction={sendTestEmailAction}
        />
      </Card>
    </div>
  );
}
