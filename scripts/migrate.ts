/**
 * Creates (or verifies) the PRX database schema. Run with `npx tsx scripts/migrate.ts`.
 *
 * The app also bootstraps the schema on first use, so this is only needed to
 * prepare a database ahead of time or to check connectivity. Idempotent.
 * Reads DATABASE_URL from the environment or from the .env* files Next.js
 * would load (e.g. `.env.local` from `vercel env pull`).
 */
import { loadEnvConfig } from "@next/env";
import { closeDb, ensureSchema } from "@/lib/db";

async function main(): Promise<void> {
  // Must run before anything reads DATABASE_URL (db.ts reads it lazily on first use).
  loadEnvConfig(process.cwd());
  await ensureSchema();
  console.log("Database schema is up to date");
}

main()
  .catch((error: unknown) => {
    console.error("Migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
