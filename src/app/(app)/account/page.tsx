import type { Metadata } from "next";
import { CalendarDays, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { changePassword, logout, removeCalendarFeed, resetCalendarFeed, signOutEverywhere, updateProfile } from "@/app/actions";
import { Alert, Avatar, Card, CardHeader, PageHeader, focusRing } from "@/components/ui";
import { SimpleForm } from "@/components/simple-form";
import { SubmitButton } from "@/components/submit-button";
import { ProfileForm } from "@/components/profile-form";
import { CopyValue } from "@/components/copy-value";
import { ConfirmButton } from "@/components/confirm-button";
import { avatarUrl, cn, ROLE_LABEL } from "@/lib/utils";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ signedOut?: string }> }) {
  const user = await requireUser();
  const { signedOut } = await searchParams;
  const feed = user.calendarToken ? `${await getBaseUrl()}/api/calendar/${user.calendarToken}.ics` : null;
  const children = user.role === "PARENT"
    ? await db.parentLink.findMany({ where: { parentId: user.id }, include: { student: { select: { id: true, name: true, gradeLevel: true, avatarUpdatedAt: true } } } })
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My account" description={`${ROLE_LABEL[user.role]} at ${user.school.name}`} />
      <div className="space-y-6">
        {signedOut && <Alert>You've been signed out on every other device.</Alert>}
        <Card>
          <CardHeader title="Profile" />
          <div className="p-5">
            <ProfileForm
              action={updateProfile}
              user={{
                name: user.name, email: user.email, phone: user.phone ?? "", bio: user.bio ?? "", emailReminders: user.emailReminders,
                avatarUrl: avatarUrl(user), role: user.role,
              }}
            />
          </div>
        </Card>

        {children.length > 0 && (
          <Card>
            <CardHeader title="My children" description="Linked by the school. Ask the office if someone is missing." />
            <ul className="divide-y divide-slate-100">
              {children.map(({ student: s }) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={s.name} size="sm" src={avatarUrl(s)} />
                  <span className="text-sm font-medium text-slate-900">{s.name}</span>
                  {s.gradeLevel && <span className="text-sm text-slate-500">{s.gradeLevel}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card id="calendar" className="scroll-mt-20">
          <CardHeader title="Calendar subscription" description="See due dates, quizzes, exams and events in Google Calendar, Outlook or your phone's calendar. It updates by itself." />
          <div className="space-y-4 p-5">
            {feed ? (
              <>
                <div className="min-w-0">
                  <p className="mb-1.5 text-sm font-medium text-slate-800">Your private calendar link</p>
                  <div className="overflow-x-auto rounded-lg bg-slate-50 p-2"><CopyValue value={feed} label="Copy link" /></div>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  <li><strong>Google Calendar:</strong> Other calendars → + → From URL → paste the link.</li>
                  <li><strong>Outlook:</strong> Add calendar → Subscribe from web → paste the link.</li>
                  <li><strong>iPhone:</strong> Settings → Calendar → Accounts → Add subscribed calendar.</li>
                </ul>
                <p className="text-xs text-slate-500">Anyone with this link can see your calendar. If you shared it by mistake, make a new one.</p>
                <div className="flex flex-wrap gap-2">
                  <form action={resetCalendarFeed}>
                    <ConfirmButton message="Make a new link? Calendars using the old link will stop updating." className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100", focusRing)}>
                      <RefreshCw className="size-4" aria-hidden />Make a new link
                    </ConfirmButton>
                  </form>
                  <form action={removeCalendarFeed}>
                    <ConfirmButton message="Turn off the calendar link?" className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-rose-700 hover:bg-rose-50", focusRing)}>
                      <Trash2 className="size-4" aria-hidden />Turn off
                    </ConfirmButton>
                  </form>
                </div>
              </>
            ) : (
              <form action={resetCalendarFeed}>
                <SubmitButton variant="secondary" pendingText="Creating…"><CalendarDays className="size-4" aria-hidden />Create my calendar link</SubmitButton>
              </form>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Change password" description="You'll stay signed in here and be signed out on other devices." />
          <div className="p-5">
            <SimpleForm
              action={changePassword}
              resetOnSuccess
              submitLabel="Change password"
              fields={[
                { name: "current", label: "Current password", type: "password", required: true, autoComplete: "current-password" },
                { name: "password", label: "New password", type: "password", required: true, autoComplete: "new-password", half: true, hint: "At least 8 characters, with a letter and a number." },
                { name: "confirm", label: "Confirm new password", type: "password", required: true, autoComplete: "new-password", half: true },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Devices" description="Lost a phone, or signed in on a shared computer? End every other session." />
          <div className="flex flex-col gap-2 p-5 sm:flex-row sm:justify-end">
            <form action={signOutEverywhere}>
              <ConfirmButton message="Sign out on every other device? You'll stay signed in here."
                className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 sm:min-h-10", focusRing)}>
                Sign out of all other devices
              </ConfirmButton>
            </form>
            <form action={logout}>
              <SubmitButton variant="secondary" pendingText="Signing out…"><LogOut className="size-4" aria-hidden />Sign out</SubmitButton>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
