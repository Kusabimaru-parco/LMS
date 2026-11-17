// Runs once when the server starts. Prints the setup code on a fresh install and starts the
// background job timer (reminders, weekly parent summaries).
// Everything must stay inside `if (process.env.NEXT_RUNTIME === "nodejs")`: Next replaces that value
// at build time, so the block (and its Node-only imports) is removed from the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { printSetupBanner } = await import("./lib/settings");
      await printSetupBanner();
    } catch (err) {
      console.error("[campus-lms] Could not reach the database on startup. Check DATABASE_URL.\n", err);
    }

    // Serverless hosts (Vercel) don't keep a process running: use /api/cron there instead.
    const g = globalThis as unknown as { __lmsJobs?: NodeJS.Timeout };
    if (process.env.DISABLE_JOBS !== "true" && !process.env.VERCEL && !g.__lmsJobs) {
      const tick = async () => {
        try {
          const { runJobs } = await import("./lib/jobs");
          const r = await runJobs();
          if (r.reminders || r.digests) console.log(`[campus-lms] Sent ${r.reminders} reminder(s) and ${r.digests} weekly summary email(s).`);
        } catch (err) {
          console.error("[campus-lms] Background job failed:", err);
        }
      };
      setTimeout(tick, 60_000);
      g.__lmsJobs = setInterval(tick, 15 * 60_000);
    }
  }
}
