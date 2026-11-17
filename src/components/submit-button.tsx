"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type BtnVariant } from "./ui";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className,
  name,
  value,
  pending: pendingProp,
  onClick,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: BtnVariant;
  className?: string;
  name?: string;
  value?: string;
  /** Pass when the form submits through useFormAction (useFormStatus only sees `<form action>`). */
  pending?: boolean;
  onClick?: () => void;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-disabled={pending} className={className} name={name} value={value} onClick={onClick}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}
