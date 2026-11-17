"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import type { FormState } from "@/app/actions";
import { Alert, Avatar, Field, Input, Textarea, focusRing } from "./ui";
import { SubmitButton } from "./submit-button";
import { cn } from "@/lib/utils";

/** Crops the picture to a centred square and shrinks it to 320 px, so phone photos upload fast. */
async function squareResize(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 320;
  canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 320, 320);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.88));
}

export function ProfileForm({
  action,
  user,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  user: { name: string; email: string; phone: string; bio: string; emailReminders: boolean; avatarUrl: string | null; role: string };
}) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const [preview, setPreview] = useState<string | null>(user.avatarUrl);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [remove, setRemove] = useState(false);
  const [picError, setPicError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const e = state?.errors ?? {};

  async function choose(file: File | undefined) {
    setPicError(undefined);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setPicError("Choose a photo (JPG, PNG or WebP).");
    try {
      const b = await squareResize(file);
      setBlob(b);
      setRemove(false);
      setPreview(URL.createObjectURL(b));
    } catch {
      setPicError("That picture couldn't be read. Try a JPG or PNG.");
    }
  }

  function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    fd.delete("avatarFile");
    if (blob) fd.set("avatar", blob, "avatar.jpg");
    if (remove) fd.set("removeAvatar", "on");
    startTransition(() => dispatch(fd));
  }

  const err = (k: string) => ({ "aria-invalid": !!e[k] || undefined, "aria-describedby": e[k] ? `p-${k}-error` : undefined });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar name={user.name} size="xl" src={remove ? null : preview} />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label htmlFor="p-avatar" className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500 sm:min-h-10")}>
              <Camera className="size-4" aria-hidden />{preview && !remove ? "Change photo" : "Add a photo"}
              <input ref={fileRef} id="p-avatar" name="avatarFile" type="file" accept="image/*" className="sr-only" onChange={(ev) => choose(ev.target.files?.[0])} aria-describedby="p-avatar-hint" />
            </label>
            {preview && !remove && (
              <button type="button" onClick={() => { setRemove(true); setBlob(null); if (fileRef.current) fileRef.current.value = ""; }}
                className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 sm:min-h-10", focusRing)}>
                <Trash2 className="size-4" aria-hidden />Remove
              </button>
            )}
          </div>
          <p id="p-avatar-hint" className="text-xs text-slate-500">A clear photo of your face helps teachers and classmates recognise you.</p>
          {(picError ?? e.avatar) && <p role="alert" className="text-xs font-medium text-rose-600">{picError ?? e.avatar}</p>}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="p-name" required error={e.name}>
          <Input id="p-name" name="name" defaultValue={user.name} autoComplete="name" required {...err("name")} />
        </Field>
        <Field label="Email" htmlFor="p-email" hint="Ask your school administrator to change it.">
          <Input id="p-email" value={user.email} readOnly disabled aria-describedby="p-email-hint" />
        </Field>
        <Field label="Phone" htmlFor="p-phone" hint="Optional. Visible to school staff." error={e.phone}>
          <Input id="p-phone" name="phone" type="tel" defaultValue={user.phone} autoComplete="tel" {...err("phone")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="About me" htmlFor="p-bio" hint="Optional. A sentence or two, shown on your profile." error={e.bio}>
            <Textarea id="p-bio" name="bio" rows={3} maxLength={500} defaultValue={user.bio} {...err("bio")} />
          </Field>
        </div>
      </div>

      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-800">Email notifications</legend>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="emailReminders" defaultChecked={user.emailReminders} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
          <span className="text-sm text-slate-700">
            {user.role === "PARENT"
              ? "Send me a weekly summary of my children's grades, missing work and attendance (Monday mornings)."
              : user.role === "STUDENT"
                ? "Remind me by email the day before an assignment, quiz or exam is due."
                : "Send me reminder emails from the LMS."}
          </span>
        </label>
      </fieldset>

      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Saving…">Save profile</SubmitButton>
      </div>
    </form>
  );
}
