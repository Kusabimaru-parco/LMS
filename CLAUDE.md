# Campus LMS: project notes for Claude

- Stack: Next.js 15 App Router + TypeScript + Tailwind 4 + Prisma + PostgreSQL. See README.md and docs/INSTALL.md.
- Product model: every school self-hosts its own copy. A fresh install sends everyone to the `/setup` wizard (`src/app/setup`), which is gated by a setup code (`src/lib/settings.ts`).
- **Before any UI work, load the `ui-ux-design` skill** (`.claude/skills/ui-ux-design/SKILL.md`) and follow its checklist.
- Reuse primitives from `src/components/ui.tsx`, `lms.tsx` and `simple-form.tsx` instead of creating new styles. Brand colours come from `--brand` (see `@theme inline` in globals.css).
- All mutations live in `src/app/actions.ts` (setup: `src/app/setup/actions.ts`). Each one must call `requireUser(roles)` and, for course data, `canAccessCourse()`.
- Every query must be scoped to the user's `schoolId`. Use `courseScope()` from `src/lib/queries.ts`.
- Schema change: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`. Never use `db push`; installs upgrade through `prisma migrate deploy`.
- Secrets saved from the UI must use `setSetting(key, value, { secret: true })`, which encrypts them.
- Local dev DB: `npm run db:local` (embedded Postgres, port 5433). Fresh install: `npm run db:reset`. Demo data: `npm run demo`.
- Verify with `npm run typecheck`, then check pages at 375px and 1280px wide.
