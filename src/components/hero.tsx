// The dashboard welcome banner: school colour, a personal greeting and the day's date.
import type { ReactNode } from "react";
import { patternStyle } from "@/lib/patterns";

export function Hero({ eyebrow, title, description, actions, seed }: { eyebrow: ReactNode; title: ReactNode; description: ReactNode; actions?: ReactNode; seed: string }) {
  return (
    <section className="relative mb-8 animate-rise overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 px-6 py-7 text-white shadow-md sm:px-9 sm:py-9">
      <div aria-hidden className="absolute inset-0 opacity-60" style={patternStyle(seed)} />
      {/* Keeps white text readable on light school colours */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-black/35 via-black/10 to-transparent" />
      <div aria-hidden className="absolute -bottom-20 -right-12 size-56 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden className="absolute -right-6 top-6 hidden size-36 rotate-12 rounded-[2.5rem] border-2 border-white/25 sm:block" />
      <div aria-hidden className="absolute right-20 top-16 hidden size-16 -rotate-6 rounded-2xl bg-white/15 sm:block" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/85">{eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-[2.6rem]">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}

/** A white button for use on the coloured banner. */
export const heroButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-brand-800 shadow-sm hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-700 sm:min-h-10";
