/**
 * Integration tests never touch the dev data. They run in their own Postgres schema, named by
 * TEST_DATABASE_URL, or by default DATABASE_URL with `schema=librec_test`. The schema name must
 * contain "test" or the run is refused.
 */
export function testDatabaseUrl(): string {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // no .env: rely on the environment
  }
  const explicit = process.env.TEST_DATABASE_URL;
  const base = explicit ?? process.env.DATABASE_URL;
  if (!base) throw new Error("Set TEST_DATABASE_URL (or DATABASE_URL in .env) to run the tests.");

  const url = new URL(base);
  if (!explicit) url.searchParams.set("schema", "librec_test");

  const schema = url.searchParams.get("schema") ?? "public";
  if (!/test/i.test(schema)) {
    throw new Error(
      `Refusing to run tests against schema "${schema}". Use a schema with "test" in its name, e.g. ?schema=librec_test.`,
    );
  }
  return url.toString();
}
