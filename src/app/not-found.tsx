import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Compass className="size-7" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-600">This page doesn't exist, or you don't have access to it.</p>
      <ButtonLink href="/dashboard" className="mt-6">Go to dashboard</ButtonLink>
    </div>
  );
}
