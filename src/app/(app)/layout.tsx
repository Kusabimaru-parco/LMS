import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isSetupComplete } from "@/lib/settings";
import { logoUrl } from "@/lib/school";
import { AppShell } from "@/components/app-shell";
import { logout } from "../actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const user = await requireUser();
  return (
    <div style={{ "--brand": user.school.brandColor } as CSSProperties}>
      <AppShell
        user={{ name: user.name, email: user.email, role: user.role }}
        schoolName={user.school.name}
        logoUrl={logoUrl(user.school)}
        logoutAction={logout}
      >
        {children}
      </AppShell>
    </div>
  );
}
