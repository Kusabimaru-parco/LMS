import pkg from "../../package.json";

/** The running Campus LMS version (from package.json, bumped for every release). */
export const APP_VERSION: string = pkg.version;

/** Compares "1.10.2" with "1.9.0": returns 1, 0 or -1. Pre-release tags are ignored. */
export function compareVersions(a: string, b: string) {
  const pa = a.replace(/^v/, "").split("-")[0].split(".").map(Number);
  const pb = b.replace(/^v/, "").split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
