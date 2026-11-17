"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "./ui";

/** A value shown in monospace with a copy button (temporary passwords, class codes). */
export function CopyValue({ value, label = "Copy", className, large }: { value: string; label?: string; className?: string; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked on plain-http LAN installs; the value stays selectable.
    }
  }
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <code
        className={cn(
          "select-all rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono font-semibold tracking-wider text-slate-900",
          large ? "text-xl sm:text-2xl" : "text-sm",
        )}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100", focusRing)}
      >
        {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : label}</span>
      </button>
    </div>
  );
}
