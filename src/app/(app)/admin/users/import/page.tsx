import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { previewImport, runImport } from "@/app/admin-actions";
import { PageHeader } from "@/components/ui";
import { ImportUsers } from "@/components/import-users";

export const metadata: Metadata = { title: "Import people" };

export default async function ImportPage() {
  await requireUser(["ADMIN"]);
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ChevronLeft className="size-4" aria-hidden />People
      </Link>
      <PageHeader title="Import people" description="Add a whole year group, staff list or parent list at once, and put students straight into their classes." />
      <ImportUsers preview={previewImport} run={runImport} />
    </div>
  );
}
