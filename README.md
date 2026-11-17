# Campus LMS

A modern, accessible learning management system for schools. It works on desktop, tablet and phone.

## Features

| Role | What they can do |
|---|---|
| **Administrator** | Insights dashboard (activity, classes falling behind, students at risk), add people one by one or by CSV import, parent accounts, reset passwords, school branding, email settings and custom email templates, grade weights and grading periods, report cards, Google/Microsoft sign-in, school-wide calendar events |
| **Teacher** | Course outline with modules (activity instructions, uploaded or linked PDFs and slides), lessons, assignments with rubrics, quizzes and exams with automatic marking and random question draws, a shared question bank, attendance, class join codes, class calendar events, student list with emails, gradebook with category weights |
| **Student** | Join classes with a code, dashboard of upcoming work, read materials and lessons, hand in text, files and links, take timed quizzes and exams, calendar (also in Google/Outlook), email reminders, grades, rubric feedback, attendance and report cards |
| **Parent** | One dashboard per child (grades, missing work, due dates, attendance, announcements), report cards, calendar, and a weekly summary email |
| **Everyone** | Profile with photo, notification settings, password reset by email, sign in with Google or Microsoft, install on phone as an app |

Each school runs its own copy on its own server or cloud account. On first launch, a **setup wizard** collects the school's details, logo, colours and first administrator. See **[docs/INSTALL.md](docs/INSTALL.md)** for every hosting option.

## Local development

```bash
npm install
npm run db:local          # terminal 1: local PostgreSQL on port 5433 (no Docker needed)
npm run db:deploy         # terminal 2: create the tables
npm run dev               # http://localhost:3000, which opens the setup wizard
```

The setup code is printed in the `npm run dev` output.

| Command | What it does |
|---|---|
| `npm run db:reset` | Wipes the database, so you get a fresh install and the setup wizard again |
| `npm run demo` | Loads the demo school "Northfield Academy" and skips the wizard. Set `DEMO_MODE="true"` for one-click sign-in. Every demo account's password is `demo1234` (for example admin@, teacher@ or student@northfield.edu). |
| `npm run db:migrate -- --name <change>` | After editing `prisma/schema.prisma`, creates a versioned migration |
| `npm run typecheck` | Checks types |

## Tech stack

- **Next.js 15** (App Router, Server Components, Server Actions) + **TypeScript**
- **Tailwind CSS 4** with design tokens in `src/app/globals.css`
- **Prisma** ORM + **PostgreSQL**, with versioned migrations in `prisma/migrations`
- Auth: bcrypt password hashes + signed JWT session cookie (httpOnly)

## Project layout

```
prisma/schema.prisma        data model (School, User, Course, Lesson, Assignment, Submission…)
src/app/actions.ts          server actions (mutations), with validation and permission checks
src/app/quiz-actions.ts     quiz and exam actions (builder, attempts, grading, question bank)
src/app/admin-actions.ts    admin actions (people, CSV import, email templates, grading setup, sign-in)
src/lib/grading.ts          weighted averages, report card data, attendance summaries
src/lib/jobs.ts             background jobs: due reminders, weekly parent summaries
src/lib/email-templates.ts  built-in email texts and the branded layout (also used for the live preview)
src/app/api/upload/         file uploads (module materials, student submissions)
src/app/api/files/[id]      serves uploaded files to people allowed to see them
src/lib/email.ts            SMTP / Resend / SendGrid / Brevo sending and email templates
src/lib/storage.ts          upload checks, disk storage, link embeds (Google Slides, YouTube…)
src/lib/quiz.ts             question types and automatic grading
src/app/(app)/...           signed-in pages (dashboard, courses, assignments, grades, admin)
src/components/ui.tsx       design-system primitives (Button, Card, Badge, Field…)
src/components/app-shell.tsx  responsive navigation (sidebar / drawer / bottom tabs)
src/lib/auth.ts             current user + course permission checks
src/lib/settings.ts         install settings, setup state and setup code
src/lib/secrets.ts          AES-256-GCM encryption for stored secrets
src/app/setup/              first-run setup wizard
install.sh, lms.sh, docker-compose.yml, Dockerfile, deploy/Caddyfile   Linux install + management
install-windows.cmd, lms.cmd, deploy/windows/   Windows Server install + management (service, backups, updates)
scripts/setup-baas.mjs, vercel.json          managed hosting setup (Vercel + Supabase/Neon)
scripts/package-release.sh, .github/workflows/   release packaging and CI
.claude/skills/ui-ux-design design rules every UI change must follow
```

## Installing for a school

| Hosting | Install | Update |
|---|---|---|
| Linux server (Docker) | `sudo ./install.sh` (HTTPS, firewall, nightly backups, `lms` command) | `lms update --from campus-lms-X.Y.Z.tar.gz` |
| Windows Server | `install-windows.cmd` as administrator (runs as a service) | `lms update -From campus-lms-X.Y.Z.zip` |
| Vercel + Supabase/Neon | `npm run setup:baas`, then import the env file in Vercel | Merge the release and redeploy |

Updates back up first, check health and roll back automatically if the new version doesn't start.

- [docs/INSTALL.md](docs/INSTALL.md): every hosting option
- [docs/UPDATING.md](docs/UPDATING.md): releases, versions and how updates reach schools
- [docs/SECURITY-REPORT.md](docs/SECURITY-REPORT.md): security assessment
- [CHANGELOG.md](CHANGELOG.md): what changed in each version

## Releasing a new version

Bump `version` in `package.json`, update `CHANGELOG.md`, then `git tag vX.Y.Z && git push origin vX.Y.Z`. GitHub Actions builds the Docker image and the Linux/Windows packages. `npm run release` builds the packages locally into `dist/`.

## Roadmap ideas for selling to schools

- File uploads for lessons and submissions (S3 / R2)
- Quizzes with automatic grading
- Parent accounts and email notifications
- Calendar view, attendance, report-card export (PDF/CSV)
- Bulk CSV import of students and teachers
- SSO with Google Workspace for Education / Microsoft 365
- Separate subdomain per school (`northfield.yourlms.com`)
