import { defineConfig, devices } from "@playwright/test"

// The customer phone login across a subdomain and a custom domain, against the Firebase Auth EMULATOR (no real SMS).
//   npx firebase-tools emulators:start --only auth --project demo-tany      (port 9099)
//   DATABASE_URL=... ENCRYPTION_KEY=... BLIND_INDEX_KEY=... pnpm exec playwright test -c playwright.cabs-login.config.ts
// The database needs e2e/cabs-seed.sql (it adds `kaveri-cabs` with the verified domain cabs.example.test).
const PORT = Number(process.env.E2E_LOGIN_PORT ?? 3102)

export default defineConfig({
  testDir: "./e2e",
  testMatch: /cabs-login\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    // Stand-in for a customer's own domain pointing at the platform.
    launchOptions: { args: ["--host-resolver-rules=MAP cabs.example.test 127.0.0.1"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-e2e-login",
      ROOT_DOMAIN: `localhost:${PORT}`,
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
      BLIND_INDEX_KEY: process.env.BLIND_INDEX_KEY ?? "",
      AUTH_SECRET: "e2e-auth-secret",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIREBASE_PROJECT_ID: "demo-tany",
      FIREBASE_API_KEY: "demo-key",
      FIREBASE_APP_ID: "1:1:web:demo",
      RC_PROVIDER: "mock",
      R2_BUCKET: "",
      R2_PRIVATE_BUCKET: "",
      GOOGLE_MAPS_SERVER_KEY: "",
    },
  },
})
