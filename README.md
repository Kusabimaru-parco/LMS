# Campus LMS

A modern, accessible learning management system for schools. It works on desktop, tablet and phone.

## Features

| Role | What they can do |
|---|---|
| **Administrator** | School-wide dashboard, add and remove people, create courses and assign teachers, set the school name and brand colour, see every course and gradebook |
| **Teacher** | Create courses, lessons and assignments, post announcements, enrol students, grade work with feedback, gradebook per course |
| **Student** | Dashboard of upcoming work, read lessons and track progress, submit assignments, see grades and teacher feedback |

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
src/app/actions.ts          all server actions (mutations), with validation and permission checks
src/app/(app)/...           signed-in pages (dashboard, courses, assignments, grades, admin)
src/components/ui.tsx       design-system primitives (Button, Card, Badge, Field…)
src/components/app-shell.tsx  responsive navigation (sidebar / drawer / bottom tabs)
src/lib/auth.ts             current user + course permission checks
src/lib/settings.ts         install settings, setup state and setup code
src/lib/secrets.ts          AES-256-GCM encryption for stored secrets
src/app/setup/              first-run setup wizard
install.sh, docker-compose.yml, Dockerfile   own-server install bundle
.claude/skills/ui-ux-design design rules every UI change must follow
```

## Installing for a school

| Hosting | How |
|---|---|
| Own server (Docker) | `./install.sh`. It generates secrets, offers automatic HTTPS and prints the setup code. |
| Supabase / Neon + Vercel | Set 4 environment variables and deploy |
| Own server without Docker | `npm ci && npx prisma migrate deploy && npm run build && npm start` |

Full guide: [docs/INSTALL.md](docs/INSTALL.md).

## Roadmap ideas for selling to schools

- File uploads for lessons and submissions (S3 / R2)
- Quizzes with automatic grading
- Parent accounts and email notifications
- Calendar view, attendance, report-card export (PDF/CSV)
- Bulk CSV import of students and teachers
- SSO with Google Workspace for Education / Microsoft 365
- Separate subdomain per school (`northfield.yourlms.com`)
