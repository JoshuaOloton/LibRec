import { LOCAL_DATABASE_URL } from "../tests/test-database";

/**
 * The Playwright run uses the local Postgres from docker-compose.yml (`npm run db:up`) in its own schema
 * (`librec_test_e2e`), never DATABASE_URL. Set E2E_DATABASE_URL to use another database. The schema name must
 * contain "test" or the run is refused, because the prepare step empties it.
 */
export function e2eDatabaseUrl(): string {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // no .env: rely on the environment
  }
  const explicit = process.env.E2E_DATABASE_URL;
  const url = new URL(explicit ?? LOCAL_DATABASE_URL);
  if (!explicit) url.searchParams.set("schema", "librec_test_e2e");
  const schema = url.searchParams.get("schema") ?? "public";
  if (!/test/i.test(schema)) throw new Error(`Refusing to use schema "${schema}" for Playwright: it must contain "test".`);
  return url.toString();
}
