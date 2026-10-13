import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";

/** Create the test schema's tables once per run. */
export default function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
