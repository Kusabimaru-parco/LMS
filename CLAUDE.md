# Campus LMS: project notes for Claude

- Stack: Next.js 15 App Router + TypeScript + Tailwind 4 + Prisma + PostgreSQL. See README.md and docs/INSTALL.md.
- Product model: every school self-hosts its own copy. A fresh install sends everyone to the `/setup` wizard (`src/app/setup`), which is gated by a setup code (`src/lib/settings.ts`).
- **Before any UI work, load the `ui-ux-design` skill** (`.claude/skills/ui-ux-design/SKILL.md`) and follow its checklist.
- Reuse primitives from `src/components/ui.tsx`, `lms.tsx` and `simple-form.tsx` instead of creating new styles. Brand colours come from `--brand` (see `@theme inline` in globals.css).
- Mutations live in `src/app/actions.ts`, quizzes/exams in `src/app/quiz-actions.ts`, admin-only ones in `src/app/admin-actions.ts` (setup: `src/app/setup/actions.ts`). Each one must call `requireUser(roles)` and, for course data, `canAccessCourse()`. Never export non-action helpers from a `"use server"` file (put them in `src/lib`).
- File uploads go through route handlers in `src/app/api/upload/*` (no server-action body limit, progress bars) and are served by `src/app/api/files/[id]`, which checks access. Use `readUpload()` / `saveFile()` from `src/lib/storage.ts`.
- Email goes through `src/lib/notifications.ts` (uses the admin's active custom template or the default from `src/lib/email-templates.ts`) and `src/lib/email.ts` (providers). Always handle "email not configured". New email types: add them to `TEMPLATES`.
- Averages must use `average()` / `studentGrades()` from `src/lib/grading.ts` so category weights apply everywhere.
- Roles: ADMIN, TEACHER, STUDENT, PARENT. Parents see their children only (`courseScope`), never course pages.
- `db` omits `User.avatar` and `School.logo` bytes by default; select them explicitly where served.
- Every query must be scoped to the user's `schoolId`. Use `courseScope()` from `src/lib/queries.ts`.
- Schema change: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`. Never use `db push`; installs upgrade through `prisma migrate deploy`.
- Secrets saved from the UI must use `setSetting(key, value, { secret: true })`, which encrypts them.
- Local dev DB: `npm run db:local` (embedded Postgres, port 5433). Fresh install: `npm run db:reset`. Demo data: `npm run demo`.
- Verify with `npm run typecheck`, then check pages at 375px and 1280px wide.
- Security: keep `npm audit --omit=dev` at 0. Security headers and the CSP live in `next.config.mjs`; a new embed host must be added to `frame-src` there. Redirect targets from users go through `safeRedirectPath()`; data-changing route handlers check `sameOrigin()`.
- Releases: bump `package.json` version + `CHANGELOG.md`; migrations must be additive in minor/patch releases (see docs/UPDATING.md). Installers: `install.sh`/`lms.sh` (Linux), `deploy/windows/*.ps1` (Windows, PowerShell 5.1 compatible, ASCII only), `scripts/setup-baas.mjs` (Vercel).
- Never let update scripts delete `data/`, `backups/` or `.env`.

