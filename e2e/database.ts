/**
 * The Playwright run uses its own Postgres schema, never the dev data: DATABASE_URL (from .env) with
 * `schema=librec_test_e2e`, or E2E_DATABASE_URL. The schema name must contain "test" or the run is refused,
 * because the global setup empties it.
 */
export function e2eDatabaseUrl(): string {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // no .env: rely on the environment
  }
  const base = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL (or E2E_DATABASE_URL) to run the Playwright tests.");

  const url = new URL(base);
  if (!process.env.E2E_DATABASE_URL) url.searchParams.set("schema", "librec_test_e2e");
  const schema = url.searchParams.get("schema") ?? "public";
  if (!/test/i.test(schema)) throw new Error(`Refusing to use schema "${schema}" for Playwright: it must contain "test".`);
  return url.toString();
}
