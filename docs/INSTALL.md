# Installing Campus LMS

Campus LMS runs anywhere you can run Node.js and PostgreSQL. Pick the option that matches your school's setup.

| Option | Best for | You need |
|---|---|---|
| **A. Own server with Docker** (recommended) | Schools with a VPS, cloud VM or on-site server | A Linux server with Docker |
| **B. Managed database + Vercel** | Schools that don't want to manage a server | A Supabase or Neon account, a Vercel account |
| **C. Own server without Docker** | IT teams that already run Node and Postgres | Node 20+, PostgreSQL 14+ |

Every option ends the same way: you open `/setup` in a browser and finish the **setup wizard**, which takes about 5 minutes.

---

## A. Own server with Docker (recommended)

**Requirements:** Ubuntu 22.04+ or Debian 12 (other Linux distributions work too), 2 GB RAM, 10 GB disk, Docker Engine with the Compose plugin.

1. Copy the Campus LMS folder to the server, for example to `/opt/campus-lms`.
2. Run the installer:
   ```bash
   cd /opt/campus-lms
   sudo ./install.sh
   ```
3. Answer two questions:
   - **Domain (optional):** for example `lms.yourschool.edu`. Point the domain's DNS A record at the server first. HTTPS certificates are then set up automatically (Caddy + Let's Encrypt).
   - **Port:** only asked when there's no domain. The default is `3000`.
4. The installer generates secure passwords, builds and starts the app, and prints:
   ```
   1. Open:        https://lms.yourschool.edu/setup
   2. Setup code:  K7QM-2XRP-9TDA
   ```
5. Open the link and finish the setup wizard.

**Everyday commands** (run them in the install folder):

| Task | Command |
|---|---|
| See logs | `docker compose logs -f app` |
| Restart | `docker compose restart app` |
| Stop | `docker compose down` (data is kept) |
| Update to a new version | Replace the files (keep `.env`), then `docker compose up -d --build`. Database migrations run automatically. |
| Back up the database | `docker compose exec db pg_dump -U lms campus_lms > backup-$(date +%F).sql` |

> **Keep `.env` safe and back it up.** It holds the database password and `AUTH_SECRET`. Without `AUTH_SECRET`, saved integration passwords can't be decrypted.

---

## B. Managed database (Supabase / Neon) + Vercel

1. **Create the database**
   - **Supabase:** New project → *Connect* → copy the **Session pooler** connection string (port 5432).
   - **Neon:** New project → copy the connection string.
2. **Deploy to Vercel:** import the project (from Git or with `vercel deploy`), then add these environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | The connection string from step 1 |
   | `AUTH_SECRET` | A long random string, for example from `openssl rand -base64 48` |
   | `SETUP_CODE` | A code you choose, for example `RIVR-2026-SETU`. You'll type it into the wizard. |
   | `APP_URL` | Your site address, for example `https://lms.yourschool.edu` |

3. Vercel runs `npm run vercel-build`, which creates the database tables before building.
4. Open `https://<your-site>/setup`, enter your `SETUP_CODE` and finish the wizard. You can delete `SETUP_CODE` afterwards.

Railway and Render work the same way: set the same variables, use `npm run build` with a pre-deploy command of `npx prisma migrate deploy`, and start with `npm start`.

---

## C. Own server without Docker

```bash
# 1. Create a database
sudo -u postgres createuser -P lms          # choose a password
sudo -u postgres createdb -O lms campus_lms

# 2. Configure
cp .env.example .env    # then edit DATABASE_URL and AUTH_SECRET

# 3. Install, create the tables, build and start
npm ci
npx prisma migrate deploy
npm run build
npm start               # or use PM2 / systemd to keep it running
```

The setup code is printed in the server output when it starts. Put a reverse proxy (Nginx, Caddy or IIS) in front of it for HTTPS, and forward the `X-Forwarded-Proto` header.

---

## The setup wizard

| Step | What you enter |
|---|---|
| 1. Welcome | A system check (database, security key, demo mode), plus the **setup code** |
| 2. School details | Name, school year, timezone, address, phone, email, website |
| 3. Branding | Logo (PNG/JPG/WebP, max 1 MB) and brand colour, with a live preview and a readability check |
| 4. Administrator | The first admin account |
| 5. Review | Check everything and finish |

After setup, the wizard is locked, and everything can be changed under **School settings**.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | 32+ random characters. Signs sign-in sessions and encrypts stored secrets. |
| `SETUP_CODE` | No | Fixed setup code. If it's not set, one is generated and printed in the logs. |
| `APP_URL` | Recommended | Public address of the site, for example `https://lms.yourschool.edu` |
| `SETTINGS_ENCRYPTION_KEY` | No | A separate key for encrypting stored secrets. Defaults to `AUTH_SECRET`. |
| `DEMO_MODE` | No | `true` shows one-click demo sign-in buttons. **Never enable it for a real school.** |

## Health check

`GET /api/health` returns `{"status":"ok", ...}` with HTTP 200 when the app and database are working. Use it for uptime monitoring.
