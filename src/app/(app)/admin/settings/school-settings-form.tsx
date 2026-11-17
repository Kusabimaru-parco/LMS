"use client";

import { useEffect, useState } from "react";
import { useFormAction } from "@/components/use-form-action";
import { GraduationCap } from "lucide-react";
import { updateSchool } from "@/app/actions";
import { Alert, Card, CardHeader, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type School = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  timezone: string;
  academicYear: string;
  brandColor: string;
  logoUrl: string | null;
};

export function SchoolSettingsForm({ school }: { school: School }) {
  const { state, pending, onSubmit } = useFormAction(updateSchool);
  const [timezones, setTimezones] = useState<string[]>([school.timezone]);
  const [preview, setPreview] = useState<string | null>(school.logoUrl);
  const [remove, setRemove] = useState(false);
  const e = state?.errors ?? {};
  const err = (k: string) => ({ "aria-invalid": !!e[k] || undefined, "aria-describedby": e[k] ? `${k}-error` : undefined });

  useEffect(() => setTimezones(Intl.supportedValuesOf("timeZone")), []);
  useEffect(() => {
    if (state?.ok) setRemove(false);
  }, [state]);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}

      <Card>
        <CardHeader title="School details" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="School name" htmlFor="name" required error={e.name}>
              <Input id="name" name="name" defaultValue={school.name} required {...err("name")} />
            </Field>
          </div>
          <Field label="School year" htmlFor="academicYear" error={e.academicYear}>
            <Input id="academicYear" name="academicYear" defaultValue={school.academicYear} {...err("academicYear")} />
          </Field>
          <Field label="Timezone" htmlFor="timezone" required error={e.timezone}>
            <select id="timezone" name="timezone" defaultValue={school.timezone} key={timezones.length}
              className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:min-h-10 sm:text-sm">
              {timezones.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address" htmlFor="address" error={e.address}>
              <Input id="address" name="address" defaultValue={school.address} {...err("address")} />
            </Field>
          </div>
          <Field label="Phone" htmlFor="phone" error={e.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={school.phone} {...err("phone")} />
          </Field>
          <Field label="School email" htmlFor="email" error={e.email}>
            <Input id="email" name="email" type="email" defaultValue={school.email} {...err("email")} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Website" htmlFor="website" error={e.website}>
              <Input id="website" name="website" type="url" defaultValue={school.website} {...err("website")} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Branding" description="Changes apply for everyone right after saving." />
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {preview && !remove ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Current logo" className="size-full object-contain p-1" />
              ) : (
                <GraduationCap className="size-8 text-slate-400" aria-hidden />
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="logo" className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500 sm:min-h-10">
                Upload new logo
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                  onChange={(ev) => { const f = ev.target.files?.[0]; if (f) { setPreview(URL.createObjectURL(f)); setRemove(false); } }} />
              </label>
              {school.logoUrl && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="removeLogo" checked={remove} onChange={(ev) => setRemove(ev.target.checked)} className="size-4 accent-rose-600" />
                  Remove logo
                </label>
              )}
              <p className="text-xs text-slate-500">PNG, JPG or WebP, up to 1 MB.</p>
              {e.logo && <p role="alert" className="text-xs font-medium text-rose-600">{e.logo}</p>}
            </div>
          </div>
          <Field label="Brand colour" htmlFor="brandColor" hint="Pick a darker colour so white text stays readable." error={e.brandColor}>
            <Input id="brandColor" name="brandColor" type="color" defaultValue={school.brandColor} className="h-11 w-24 cursor-pointer p-1" />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pending={pending}>Save changes</SubmitButton>
      </div>
    </form>
  );
}
