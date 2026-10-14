/**
 * Integration tests run against the local Postgres from docker-compose.yml (`npm run db:up`), in their own schema,
 * and never against DATABASE_URL (which may be the hosted Supabase database). Set TEST_DATABASE_URL to use another
 * database. The schema name must contain "test" or the run is refused.
 */
export const LOCAL_DATABASE_URL = "postgresql://librec:librec@localhost:5443/librec";

export function testDatabaseUrl(): string {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // no .env: rely on the environment
  }
  const explicit = process.env.TEST_DATABASE_URL;
  const url = new URL(explicit ?? LOCAL_DATABASE_URL);
  if (!explicit) url.searchParams.set("schema", "librec_test");

  const schema = url.searchParams.get("schema") ?? "public";
  if (!/test/i.test(schema)) {
    throw new Error(
      `Refusing to run tests against schema "${schema}". Use a schema with "test" in its name, e.g. ?schema=librec_test.`,
    );
  }
  return url.toString();
}
