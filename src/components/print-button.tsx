"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" aria-hidden />{label}
    </Button>
  );
}
