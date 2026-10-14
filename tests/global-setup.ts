import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";

/** Create the test schema's tables once per run. */
export default function setup() {
  const url = testDatabaseUrl();
  try {
    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (err) {
    const detail = String((err as { stderr?: Buffer }).stderr ?? err).trim();
    throw new Error(
      `Could not prepare the test database (${new URL(url).host}). Is it running? Start it with: npm run db:up\n${detail}`,
    );
  }
}
