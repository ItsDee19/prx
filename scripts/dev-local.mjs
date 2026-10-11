/**
 * Runs a command against a local, file-backed Postgres (PGlite) so PRX can be
 * developed without a cloud database. Data is kept in ./data/pglite.
 *
 *   npm run dev:local     -> next dev with a local database
 *   npm run seed:local    -> load demo data into the local database
 *
 * Only one of these can run at a time, because PGlite locks its data folder.
 * In production (Vercel) PRX uses DATABASE_URL from the Neon integration.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.env.PGLITE_PORT ?? 54329);
const dataDir = path.join(process.cwd(), "data", "pglite");
const command = process.argv.slice(2);

if (command.length === 0) {
  console.error("Usage: node scripts/dev-local.mjs <command> [args...]");
  process.exit(1);
}

fs.mkdirSync(dataDir, { recursive: true });
const db = await PGlite.create(dataDir);
// The app uses a single pooled connection (DATABASE_POOL_MAX=1 below); the
// second slot lets a replacement connect while a broken one is still closing.
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 2 });
await server.start();

const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
console.log(`\n  Local Postgres (PGlite) ready at ${url}\n  Data folder: ${dataDir}\n`);

const child = spawn(command.join(" "), {
  stdio: "inherit",
  shell: true,
  // PGlite is a single-connection database, so the app uses one pooled connection.
  env: { ...process.env, DATABASE_URL: url, DATABASE_POOL_MAX: "1" },
});

let stopping = false;
async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  await server.stop().catch(() => undefined);
  await db.close().catch(() => undefined);
  process.exit(code);
}

child.on("exit", (code) => void shutdown(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
    void shutdown(0);
  });
}
