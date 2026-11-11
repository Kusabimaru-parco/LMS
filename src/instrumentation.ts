// Runs once when the server starts. Prints the setup code to the logs on a fresh install.
// The import must stay inside the NEXT_RUNTIME check so it is left out of the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { printSetupBanner } = await import("./lib/settings");
      await printSetupBanner();
    } catch (err) {
      console.error("[campus-lms] Could not reach the database on startup. Check DATABASE_URL.\n", err);
    }
  }
}
