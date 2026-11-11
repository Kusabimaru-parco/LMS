"use client";

import type { ReactNode } from "react";

/** Submit button that asks for confirmation before a destructive action. */
export function ConfirmButton({ message, children, ...p }: { message: string; children: ReactNode } & React.ComponentProps<"button">) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...p}
    >
      {children}
    </button>
  );
}
