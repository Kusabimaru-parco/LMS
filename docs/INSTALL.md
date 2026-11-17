# Installing Campus LMS

Each school runs its own copy. Pick the option that matches the school's setup:

| Option | Best for | Installer | Updates |
|---|---|---|---|
| **A. Linux server with Docker** (recommended) | Schools with a VPS, cloud VM or on-site Linux server | `sudo ./install.sh` | `lms update` |
| **B. Windows Server** | Schools that run Windows servers | `install-windows.cmd` | `lms.cmd update` |
| **C. Managed hosting (BaaS)** | Schools that don't want to run a server | `npm run setup:baas` | Redeploy from the new release |

Every option ends the same way: open `/setup` in a browser and finish the **setup wizard** (about 5 minutes).

Minimum: 2 CPU cores, 2 GB RAM (4 GB to build on the server), 10 GB disk + room for uploads and backups.

---

## A. Linux server with Docker

**Supported:** Ubuntu 22.04/24.04, Debian 12 (any Linux with Docker works). The installer can install Docker for you.

```bash
tar xzf campus-lms-1.0.0.tar.gz && cd campus-lms-1.0.0
sudo ./install.sh
```

It asks two questions, or run it without questions:

```bash
sudo ./install.sh --domain lms.yourschool.edu --email it@yourschool.edu --yes   # HTTPS on a domain
sudo ./install.sh --port 3000 --yes                                             # http on a school network
```

| Option | What it does |
|---|---|
| `--domain` | Public domain. Point its DNS **A record** at the server first. HTTPS certificates are issued and renewed automatically (Caddy + Let's Encrypt). |
| `--email` | Contact address for certificate notices |
| `--port` | Port when there's no domain (default 3000) |
| `--image ghcr.io/…/campus-lms` | Use prebuilt images instead of building on the server (faster, needs less RAM) |
| `--update-feed URL` | Where to check for new versions (see docs/UPDATING.md) |
| `--no-backups` | Don't schedule the nightly backup |
| `--yes` | No questions; installs Docker if missing |

What the installer does:

1. Checks memory, disk, free ports, Docker and DNS.
2. Generates strong secrets into `.env`, readable by root only.
3. Opens the firewall (ufw) if it's on.
4. Builds and starts the database, the app and HTTPS.
5. Installs the **`lms`** command.
6. Schedules a **nightly backup** at 02:30 that keeps the newest 14.

### Everyday commands

| Task | Command |
|---|---|
| Status, version, newest backup | `lms status` |
| Logs | `lms logs` |
| Start / stop / restart | `lms start`, `lms stop`, `lms restart` |
| Back up now | `lms backup` |
| Restore a backup | `lms restore backups/campus-lms-….dump` |
| Update | `lms update --from campus-lms-1.1.0.tar.gz` (see docs/UPDATING.md) |
| Undo the last update | `lms rollback` |
| Show the setup code | `lms setup-code` |

Backups go to `backups/`. Each one is a database dump, a `-uploads.tar.gz` and a copy of `.env`. **Copy them off the server regularly**, for example with `rsync` or to cloud storage.

---

## B. Windows Server

**Supported:** Windows Server 2019/2022/2025, Windows 10/11. Install first, **for all users**:

- [Node.js LTS](https://nodejs.org) (22 recommended)
- [PostgreSQL](https://www.postgresql.org/download/windows/) 14 or newer. Note the `postgres` password you choose.

Then extract `campus-lms-1.0.0.zip` to a permanent folder (for example `C:\CampusLMS`), right-click **`install-windows.cmd` → Run as administrator** and answer two questions: the port, and the `postgres` password.

What the installer does:

1. Checks Node.js, PostgreSQL, the port and disk space.
2. Creates the database (UTF-8) and its own database user.
3. Writes `.env` with fresh secrets, readable by Administrators and SYSTEM only.
4. Builds the app.
5. Registers a **"Campus LMS" scheduled task** that starts with Windows (no one needs to sign in) and restarts the server if it stops.
6. Opens Windows Firewall for the port (domain and private networks).
7. Schedules a nightly backup at 02:30.

### Everyday commands (Administrator command prompt in the install folder)

| Task | Command |
|---|---|
| Status | `lms status` |
| Start / stop / restart | `lms start`, `lms stop`, `lms restart` |
| Logs | `lms logs` (files in `logs\`, kept 14 days) |
| Back up now / restore | `lms backup`, `lms restore backups\….dump` |
| Update / undo | `lms update -From C:\Downloads\campus-lms-1.1.0.zip`, `lms rollback` |

An existing install made with the earlier Windows installer can switch to the service by running `lms install-service` once (as Administrator).

### HTTPS on Windows

The app listens on plain HTTP. For a public domain, put a reverse proxy in front:

- **IIS:** install URL Rewrite and Application Request Routing (ARR), add a site with your certificate, and reverse-proxy to `http://localhost:3000`. Forward the `X-Forwarded-Proto` and `X-Forwarded-Host` headers.
- **Caddy for Windows:** `caddy reverse-proxy --from lms.yourschool.edu --to localhost:3000` (automatic certificates). Run it as a service with the Task Scheduler.

Then set `APP_URL="https://lms.yourschool.edu"` in `.env` and run `lms restart`.

---

## C. Managed hosting: Vercel + Supabase or Neon

No server to maintain. You need three free or paid accounts:

| What | Use | Notes |
|---|---|---|
| Web app | [Vercel](https://vercel.com) | Hobby plan: daily background job. Pro plan: you can make it hourly in `vercel.json`. |
| Database | [Supabase](https://supabase.com) or [Neon](https://neon.tech) | Supabase: use the **Session pooler** connection string (port 5432) |
| File storage | Supabase Storage, Cloudflare R2 or AWS S3 | A **private** bucket with S3 access keys |

```bash
npm ci
npm run setup:baas
```

The setup script:

1. Asks for the database connection string, the site address and the storage details.
2. **Checks they work**: it creates the tables, and writes, reads and deletes a test file.
3. Generates secrets and writes `deploy/baas/vercel.env`.

Then:

1. In Vercel, import the repository.
2. Under Settings → Environment Variables, choose **Import .env** and pick `deploy/baas/vercel.env`.
3. Deploy, then open `/setup`.

On Vercel, uploads are limited to **4 MB per file** (a Vercel limit). The LMS already tells people to share bigger files as Google Drive, OneDrive or YouTube links.

Other hosts (Railway, Render, Fly.io) work the same way: set the same environment variables, build with `npm run vercel-build` and start with `npm start`.

---

## The setup wizard

| Step | What you enter |
|---|---|
| 1. Welcome | System check, plus the **setup code** (printed by the installer, or `lms setup-code`) |
| 2. School details | Name, school year, timezone, address, phone, email, website |
| 3. Branding | Logo (PNG/JPG/WebP, max 1 MB) and brand colour, with a live preview and a readability check |
| 4. Administrator | The first admin account |
| 5. Email | Optional: SMTP server or an email API (Resend, SendGrid, Brevo), with a test button |
| 6. Review | Check everything and finish |

After setup the wizard is locked. Everything can be changed under **School settings** (School, Email, Email templates, Grading, Sign-in).

## Email

Without email, the LMS still works: temporary passwords are shown on screen, and "Forgot password" tells people to ask the administrator.

With email turned on:

- New people get a welcome email with a temporary password, and choose their own when they first sign in.
- "Forgot password" sends a one-time link that works for 1 hour.
- Students get a reminder the day before work is due, and parents get a summary every Monday.
- Administrators can write their own versions of every email under **School settings → Email templates**, or keep the defaults.

Links in emails use the **Site address** from School settings → Email (or `APP_URL`).

## Sign in with Google or Microsoft

School settings → Sign-in explains how to create the OAuth app and shows the redirect URI to register. Only existing accounts can sign in this way (matched by email). The site must use HTTPS with a real domain.

## Install as an app

On phones and laptops, Campus LMS can be added to the home screen ("Install app" / "Add to Home Screen"). This needs HTTPS (a real domain), except on `localhost`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `MIGRATE_DATABASE_URL` | Serverless | Session connection used only for database migrations during the build. On Vercel + Supabase, `DATABASE_URL` is the Transaction pooler (port 6543, `?pgbouncer=true&connection_limit=1`) and this is the Session pooler (5432). `npm run setup:baas` sets both. |
| `AUTH_SECRET` | Yes | 32+ random characters. Signs sessions and encrypts stored secrets. **Back it up.** |
| `SETUP_CODE` | No | Fixed setup code. If it's not set, one is generated and printed in the logs. |
| `APP_URL` | Recommended | Public address, e.g. `https://lms.yourschool.edu` |
| `STORAGE_DRIVER` | No | `local` (default) or `s3` |
| `UPLOAD_DIR` | No | Folder for uploads with `local` (default `data/uploads`) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | With `s3` | S3-compatible bucket (keep it private) |
| `MAX_UPLOAD_MB` | No | Largest upload in MB (default 50; 4 on Vercel) |
| `CRON_SECRET` | Vercel | Lets Vercel's scheduler call `/api/cron` |
| `DISABLE_JOBS` | No | `true` turns off reminders and weekly summaries |
| `UPDATE_FEED_URL` | No | Where to check for new versions |
| `SETTINGS_ENCRYPTION_KEY` | No | A separate key for stored secrets (defaults to `AUTH_SECRET`) |
| `DEMO_MODE` | No | `true` shows one-click demo sign-in. **Never on a real school.** |

## Health check

`GET /api/health` returns `{"status":"ok","version":"1.0.0",…}` with HTTP 200 when the app and database work. Point an uptime monitor at it.
