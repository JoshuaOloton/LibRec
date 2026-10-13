import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2e/database";

const PORT = 3100;

// The app runs against its own database schema and its own build directory, so `npm run dev` can stay running.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // `next dev` compiles a route the first time it is hit, which can take longer than the 5s default.
  expect: { timeout: 15_000 },
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // 360px wide: a common Android phone (STYLE.md)
    { name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } } },
  ],
  webServer: {
    // The schema has to exist before the server answers its first request, so it is prepared in the same command.
    command: `npx tsx e2e/prepare.ts && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/catalogue`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      NEXT_DIST_DIR: ".next-e2e",
      AUTH_TRUST_HOST: "true",
    },
  },
});
