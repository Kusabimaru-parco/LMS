# Updating Campus LMS

How new versions get from you (the vendor) to every school's server, safely.

## The short version

1. **You** tag a release (`v1.1.0`). GitHub Actions builds the Docker image, the Linux and Windows packages, `latest.json` and checksums.
2. **Schools are told**: the admin dashboard shows "Campus LMS 1.1.0 is available" (red when it contains security fixes).
3. **The school (or you) runs one command.** It builds the new version, backs up, switches, checks health and **rolls back by itself** if anything fails.

| Platform | Update command | Undo |
|---|---|---|
| Linux (Docker, built on the server) | `lms update --from campus-lms-1.1.0.tar.gz` | `lms rollback` |
| Linux (prebuilt images) | `lms update --version 1.1.0` | `lms rollback` |
| Linux (installed from git) | `lms update` (latest tag) or `lms update --version 1.1.0` | `lms rollback` |
| Windows Server | `lms update -From C:\Downloads\campus-lms-1.1.0.zip` | `lms rollback` |
| Vercel + Supabase/Neon | Merge the release into the deployed branch (or Redeploy) | Vercel: promote the previous deployment, then restore the database backup |

## Version numbers

Campus LMS uses [semantic versioning](https://semver.org): **MAJOR.MINOR.PATCH**.

| Change | Example | Meaning for schools |
|---|---|---|
| Patch | 1.0.0 → 1.0.1 | Bug and security fixes only. Always safe; install soon. |
| Minor | 1.0.1 → 1.1.0 | New features. Database changes are additive. Safe with the normal update. |
| Major | 1.x → 2.0.0 | May need a manual step. The release notes say exactly what. |

Schools can skip versions (1.0.0 → 1.3.0 directly). Database migrations always run in order.

## What happens during an update (Linux and Windows)

```
1. Save the current version     code snapshot (.update/) so rollback is instant
2. Build the new version         while the old one keeps serving students
   └─ build fails?               → nothing changed, the old version keeps running
3. Back up                       database + uploaded files + .env (backups/…-before-1.1.0)
4. Switch                        stop old, start new; database migrations run on start
5. Health check (up to 4 min)    /api/health must answer "ok" with the new version number
   └─ not healthy?               → automatic rollback: previous code + database restored
                                   from step 3, previous version started again
```

Downtime is usually under a minute (step 4). Plan updates outside school hours, and tell staff.

`lms rollback` does the same rollback by hand, for example if a problem is noticed the next morning. It restores the database from just before the update, so **work done after the update is lost**. Prefer a quick patch release when you can.

## Database changes (rules for developers)

Migrations live in `prisma/migrations` and run with `prisma migrate deploy` (automatic on start). To keep every update safe:

1. **Additive only in minor and patch releases.** Add tables, columns (nullable or with a default) and indexes. Never rename or drop in the same release.
2. **Renames and drops take two releases** ("expand and contract"): release N adds the new column and writes both, release N+1 stops using the old one, and a later major release drops it.
3. **Never edit a migration that has been released.** Add a new one.
4. **Test on real data.** Restore a recent school backup on a test server (`lms restore …`), run the update, and click through.
5. Keep big data changes out of migrations. Do them in small batches in a background job instead.

## How to publish a release (vendor checklist)

1. Update `CHANGELOG.md` and bump `version` in `package.json`.
2. Run `npm run typecheck`, `npm run build` and `npm audit --omit=dev`. They must pass; CI runs them too.
3. Test the update on a copy of a real school backup.
4. Commit, then tag and push:
   ```bash
   git tag v1.1.0 && git push origin v1.1.0
   ```
5. GitHub Actions (`.github/workflows/release.yml`) then:
   - builds and pushes `ghcr.io/<owner>/campus-lms:1.1.0` (and `:latest`);
   - attaches `campus-lms-1.1.0.tar.gz`, `campus-lms-1.1.0.zip`, `latest.json` and `SHA256SUMS` to a GitHub Release.
6. **Publish the update feed.** Copy `latest.json` to a public HTTPS address every school uses as `UPDATE_FEED_URL`, for example a static page on your website or a public storage bucket. (The GitHub repository is private, so schools can't read release files from it directly.) For a security release, set `RELEASE_SECURITY=true` when packaging, or edit `"security": true` in the file.
7. **Deliver the package** to schools that build from source: a download link (with `SHA256SUMS`), or do it yourself over remote access.

You can also package by hand on any computer: `npm run release` writes the same files into `dist/`.

### Prebuilt images (recommended once you have several schools)

Installing with `--image ghcr.io/<owner>/campus-lms` means schools never build. Updates become `lms update --version 1.1.0`: a download and a switch. GHCR images of a private repository are private too. Either make the **package** public in GitHub (the source code stays private), or give each school a read-only token (`docker login ghcr.io`).

## Security updates

- **Dependabot** (`.github/dependabot.yml`) opens a pull request every week when a dependency has an update, and immediately for security advisories.
- **CI** fails if `npm audit` finds a high or critical vulnerability in production dependencies.
- Ship security fixes as **patch releases** with `"security": true` in `latest.json`. Admins then see a red notice on their dashboard.
- Tell every school directly too (email). Some will have the update check turned off.

## Managed hosting (Vercel + Supabase/Neon)

- Each school's Vercel project deploys a branch of your repository (or of their fork). **Merging the release into that branch deploys it.** `npm run vercel-build` applies database migrations during the build, so a failed migration stops the deploy before anything goes live.
- Before a minor or major release, take a database backup (Supabase: Database → Backups; Neon: create a branch).
- To undo: in Vercel → Deployments, **Promote to Production** on the previous deployment. If the release changed the database, also restore the backup.

## Support policy (suggested)

- Support the current and previous minor version (for example 1.3 and 1.2) with security fixes.
- Ask schools to apply security releases within 7 days, and other releases within a term.
- Keep `CHANGELOG.md` readable for school IT staff: what changed, and whether there's a manual step.
