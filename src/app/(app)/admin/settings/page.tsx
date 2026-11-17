import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { logoUrl } from "@/lib/school";
import { PageHeader } from "@/components/ui";
import { SchoolSettingsForm } from "./school-settings-form";
import { SettingsTabs } from "@/components/settings-tabs";
import { APP_VERSION } from "@/lib/version";

export const metadata: Metadata = { title: "School settings" };

export default async function SettingsPage() {
  const admin = await requireUser(["ADMIN"]);
  const s = admin.school;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="School settings" description="Details and branding shown to everyone at your school." />
      <SettingsTabs current="/admin/settings" />
      <SchoolSettingsForm
        school={{
          name: s.name,
          address: s.address ?? "",
          phone: s.phone ?? "",
          email: s.email ?? "",
          website: s.website ?? "",
          timezone: s.timezone,
          academicYear: s.academicYear ?? "",
          brandColor: s.brandColor,
          logoUrl: logoUrl(s),
        }}
      />
      <p className="mt-8 text-center text-xs text-slate-500">Campus LMS version {APP_VERSION}</p>
    </div>
  );
}
