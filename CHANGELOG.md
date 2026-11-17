# Changelog

All notable changes. Versions follow [semantic versioning](https://semver.org). See docs/UPDATING.md.

## 1.0.0 (2026-11-17)

First production release.

### Added
- Production installers: Linux (`install.sh` + `lms` command), Windows Server (`install-windows.cmd` + `lms.cmd`, runs as a service), and managed hosting (`npm run setup:baas` for Vercel + Supabase/Neon).
- Safe updates with automatic backup, health check and rollback (`lms update`, `lms rollback`); nightly backups.
- S3-compatible file storage (Supabase Storage, Cloudflare R2, AWS S3) for serverless hosting.
- "New version available" notice for administrators (`UPDATE_FEED_URL`).
- New "paper and ink" visual identity: self-hosted fonts, course cover patterns, redesigned navigation and dashboard banner.
- "Sign out of all other devices" in My account.
- Release automation (GitHub Actions), CI and Dependabot.

### Security
- Upgraded Next.js 15.3 → 15.5.29 (fixes critical remote code execution issues, including on Windows hosts), React 19.2.9, nodemailer 10.6.0 and zod 4.6.7.
- Added a Content Security Policy and security headers, plus HSTS over HTTPS.
- Fixed an open redirect after sign-in, tightened the brute-force limits, and added cross-site request checks and size limits to uploads.
- Fixed a redirect loop when a session was revoked, and other issues. Full details in docs/SECURITY-REPORT.md.

## 0.1.0

Initial development version: courses, modules, assignments, quizzes and exams, attendance, rubrics, parents, report cards, email, setup wizard.
