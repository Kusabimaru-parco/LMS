// Local PostgreSQL for development, with no Docker or system install needed.
// Usage: npm run db:local   (keep it running in its own terminal)
// Connection: postgresql://postgres:postgres@localhost:5433/campus_lms
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(".pgdata");
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "postgres",
  port: 5433,
  persistent: true,
  onLog: () => {},
});

if (!existsSync(dir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("campus_lms");
} catch {
  /* already exists */
}
console.log("Local Postgres ready: postgresql://postgres:postgres@localhost:5433/campus_lms (Ctrl+C to stop)");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
