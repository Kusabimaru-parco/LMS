# Campus LMS security assessment

**Version assessed:** 1.0.0 (before and after fixes) · **Date:** 17 November 2026 · **Result:** all findings fixed and re-tested

## 1. Summary

The assessment covered dependencies, the application code and the running app. **15 issues** were found, including **1 critical**. All 15 are fixed. After the fixes:

- `npm audit` reports **0 known vulnerabilities**, for production and development dependencies.
- **34 of 34** attack tests pass.

| Severity | Found | Fixed |
|---|---|---|
| Critical | 1 | 1 |
| High | 3 | 3 |
| Medium | 6 | 6 |
| Low | 5 | 5 |

The most serious problem was the web framework version, not the app's own code. Next.js 15.3.3 had publicly known remote code execution flaws, including one that affects **servers running on Windows**. Upgrading removed them.

## 2. How it was tested

1. **Dependency audit:** `npm audit` against the GitHub Advisory Database, checking every package and the versions that fix each advisory.
2. **Code review:**
   - sign-in, sessions and password reset;
   - permission checks on every server action and API route (66 actions reviewed);
   - file upload and download, input validation, output encoding and redirects;
   - secrets storage, email, Google/Microsoft sign-in, background jobs and the calendar feed.
3. **Live attack tests** against a running copy:
   - 31 automated HTTP tests with forged and real sessions for each role;
   - 3 tests in a real browser (script injection, open redirect, brute force).

## 3. Findings and fixes

| ID | Severity | Finding | Fix | Verified |
|---|---|---|---|---|
| S-01 | **Critical** | **Next.js 15.3.3** had many known vulnerabilities, including unauthenticated remote code execution (React Server Components "flight" protocol, GHSA-9qr9-h5gf-34mp; Windows-hosted servers, GHSA-p293-qw3h-jr36), middleware bypass, SSRF, cache poisoning and denial of service. | Upgraded to **Next.js 15.5.29** and **React 19.2.9**. Turned off the unused image optimizer, which removes a whole group of advisories. | `npm audit`: 0 |
| S-02 | High | **nodemailer 6.10.1**: email-address parsing flaws (mail delivered to unintended recipients) and a pre-auth DoS in the SMTP client. | Upgraded to **10.6.0**. | `npm audit` |
| S-03 | High | **zod 3**: memory exhaustion while validating oversized collections. | Upgraded to **4.6.7** and adapted the code. | `npm audit`, typecheck, form tests |
| S-04 | High | Vulnerable **postcss** (file disclosure via source maps) and **sharp/libvips** inside Next.js. | Forced postcss 8.5.33; image optimizer off. | `npm audit` |
| S-05 | Medium | **Open redirect after sign-in.** `?next=/\evil.com` sent users to another site after they signed in (password or Google/Microsoft), which helps phishing. | `safeRedirectPath()` only allows paths on this site. It rejects `//`, backslashes and control characters. | Browser test: stayed on site |
| S-06 | Medium | **Weak brute-force protection.** The limit trusted the client-supplied IP header and counted IP+email together, so attackers could guess one account's password from rotating IPs. | 10 attempts per account and 40 per IP per 15 minutes. Uses the IP seen by our own proxy (right-most `X-Forwarded-For`). | Browser test: locked after 10 |
| S-07 | Medium | **No security headers.** No Content Security Policy, and pages could be framed (clickjacking). | CSP with `frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and a fixed list of allowed embed hosts. Added `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, and HSTS over HTTPS. | Header tests |
| S-08 | Medium | **Password-reset link poisoning.** If an admin cleared the site address, reset links were built from the request's `Host` header, so an attacker could send a victim a real reset email pointing to the attacker's site. | The site address can't be emptied; links always use the saved address. | Code review |
| S-09 | Medium | **Revoked sessions caused an endless redirect loop** (the page rejected the session, the middleware accepted it). There was also no way to end other sessions after losing a device. | New `/api/auth/signout` clears dead sessions (it ignores valid ones, so it can't be used to log people out). Added **Sign out of all other devices**. | Test 29 + browser |
| S-10 | Medium | **Upload routes had no cross-site request check.** Cookies are `SameSite=Lax`, which already blocks most attacks, but there was no second line of defence. | `sameOrigin()` check on both upload routes. | Test 15: 403 |
| S-11 | Low | **Memory exhaustion by large uploads:** the whole request was read into memory before the size check. | Rejects requests over the limit from `Content-Length` before reading (413). The browser also checks the total size. | Test 18: 413 |
| S-12 | Low | **Lesson progress outside a course:** a student could record progress for a lesson from another course (data integrity). | The lesson must belong to the course. | Code review |
| S-13 | Low | **Spreadsheet formula injection** in the downloadable temporary-password list (names starting with `=`, `+`, `-`, `@`). | Such cells are prefixed with `'`. | Code review |
| S-14 | Low | **Account discovery by timing:** "Forgot password" took longer for real accounts (it sent an email). | The email is sent in the background, so responses take the same time. | Code review |
| S-15 | Low (privacy) | **Google Fonts** loaded from Google's servers, sharing students' IP addresses with a third party. | Fonts are self-hosted with `next/font`; no third-party requests on page load. | CSP has no external font hosts |

Fixed earlier in development and re-checked now: uploaded files are never kept in the browser cache (`no-store` for student work), so the next person on a shared lab computer can't see them. Test 28 also checks that the sign-out link can't be used for logout CSRF.

## 4. Attack tests (all passing)

| Area | Tests |
|---|---|
| Sign-in and sessions | Signed-out access blocked on pages and file/avatar APIs (4). Tampered and `alg=none` tokens rejected. Sessions from before a password change rejected. Brute-force lock after 10 attempts. Open redirect blocked. |
| Permissions (IDOR) | A teacher can't open another teacher's course or the admin pages. A parent can't open course pages or another family's report card. A student can't open the question bank (answers) or the quiz editor. |
| Uploads | Cross-site upload blocked (403). A student can't add materials. A teacher can't add materials to another teacher's course. Oversized requests refused (413). HTML, script and SVG files refused (magic-byte and type checks). `javascript:` links refused. |
| Files | Path traversal refused. Unknown avatar returns 404. Student files private to the student and their teachers. |
| Integrations | Guessed calendar-feed token: 404. Cron with no or wrong secret: 401. Forged Google/Microsoft sign-in state rejected. |
| Injection | Script in announcements shown as text and never run. SQL in search treated as text (0 rows). |
| Headers | CSP, `nosniff`, framing protection, Referrer and Permissions policies, HSTS over HTTPS, no `X-Powered-By`. |

## 5. Security controls in place

- **Passwords:** bcrypt; 8+ characters with a letter and a number. Temporary passwords must be changed at first sign-in.
- **Sessions:** signed (HS256) `httpOnly`, `SameSite=Lax` cookies, `Secure` over HTTPS. Revoked on password change or "sign out everywhere".
- **Permissions:** every server action checks the role, and course data checks `canAccessCourse()`. All queries are scoped to the user's school.
- **Uploads:** an allow-list of file types checked by content (magic bytes), a size limit, random storage names, served with `nosniff` and download disposition for non-viewable types, and access checked on every download.
- **Secrets:** SMTP passwords, API keys and SSO secrets are stored encrypted (AES-256-GCM). `.env` is readable by administrators only (Windows ACL / `chmod 600` on Linux).
- **Password reset:** 256-bit single-use tokens, stored hashed, valid 1 hour; no account discovery.
- **Google/Microsoft sign-in:** PKCE, encrypted state cookie, issuer, audience and expiry checks; existing accounts only.
- **Deployment:**
  - The database isn't exposed outside Docker.
  - The app runs as a non-root user with `no-new-privileges`.
  - HTTPS with automatic certificates and HSTS.
  - Log rotation.
  - Nightly backups.

## 6. Remaining risks and recommendations

| Risk | Recommendation |
|---|---|
| Rate limits live in memory: they reset on restart and aren't shared between several app servers. | Fine for one server per school. For multi-server hosting, move them to Redis. |
| The CSP allows inline scripts (Next.js needs them unless nonces are used). | Move to a nonce-based CSP in a future release. |
| Sessions last 7 days; a stolen cookie works until it expires or the user signs out everywhere. | Consider shorter sessions or server-side sessions with an admin "end session" list. |
| No antivirus scanning of uploads. | Optional ClamAV scanning for schools that require it. |
| No per-user storage quota. | Add quotas if storage costs matter (BaaS). |
| Backups contain `.env` (secrets) and personal data. | Keep `backups/` private, copy it off the server **encrypted**, and test a restore each term. |
| HTTP mode (no domain) sends passwords unencrypted on the network. | Use it only on a trusted school network. Use a domain with HTTPS whenever reachable from outside. |
| No two-factor sign-in or audit log yet. | Add 2FA for admins and an audit log of admin actions (recommended before selling to large districts). |
| Privacy law (e.g. the Philippine Data Privacy Act, GDPR). | Self-hosting keeps data on the school's server. For BaaS, pick a database region near the school and sign the providers' data processing agreements. |

**Not covered by this assessment:** real email delivery, real Google/Microsoft sign-in (needs the school's own OAuth app and HTTPS domain), and the Linux and Windows installers and backup/restore on real servers. Run those on a test server before the first school goes live. An independent penetration test is recommended before selling to large districts.
