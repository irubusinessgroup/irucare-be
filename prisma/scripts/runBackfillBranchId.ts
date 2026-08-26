/**
 * Runs prisma/scripts/backfill_branch_id.sql against DATABASE_URL via psql.
 *
 * Usage (from healthlinker-be):
 *   npx ts-node prisma/scripts/runBackfillBranchId.ts
 */
import { spawnSync } from "child_process";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../.env") });

/** Strip Prisma query params — psql only accepts a plain Postgres URI. */
function toPsqlUrl(raw: string): string {
  const url = new URL(raw);
  const sslmode = url.searchParams.get("sslmode");
  url.search = "";
  if (sslmode) url.searchParams.set("sslmode", sslmode);
  return url.toString();
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is missing in .env");
  process.exit(1);
}

const sqlPath = path.join(__dirname, "backfill_branch_id.sql");
const psqlUrl = toPsqlUrl(databaseUrl);

console.log("Running branchId backfill via psql…");
const result = spawnSync(
  "psql",
  [psqlUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlPath],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status !== 0) {
  console.error("Backfill failed.");
  process.exit(result.status ?? 1);
}

console.log(
  "Done. Null branchIds set to each company's initialized branch (fallback: bhfId 00 / oldest).",
);
