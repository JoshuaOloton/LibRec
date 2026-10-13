import { testDatabaseUrl } from "./test-database";

// Must run before server/db.ts creates the Prisma client.
process.env.DATABASE_URL = testDatabaseUrl();
