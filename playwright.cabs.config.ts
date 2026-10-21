import { defineConfig, devices } from "@playwright/test"

// The TanyCabs operator flow, on a desktop browser. Needs its own migrated database in which the demo business `sri-murugan` is a
// cab operator (the dev sign-in opens that business), so it cannot share the database the car and restaurant specs use:
//   createdb tany_e2e_cabs && DATABASE_URL=postgres://.../tany_e2e_cabs pnpm db:migrate
//   psql ... -f e2e/cabs-seed.sql
//   DATABASE_URL=... ENCRYPTION_KEY=... BLIND_INDEX_KEY=... pnpm test:e2e:cabs
const PORT = Number(process.env.E2E_CABS_PORT ?? 3101)

export default defineConfig({
  testDir: "./e2e",
  testMatch: /cabs-operator\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"], trace: "retain-on-failure" },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-e2e-cabs",
      E2E: "1",
      ROOT_DOMAIN: `localhost:${PORT}`,
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
      BLIND_INDEX_KEY: process.env.BLIND_INDEX_KEY ?? "",
      RC_PROVIDER: "mock",
      VISION_API_KEY: "",
      R2_BUCKET: "",
      R2_PRIVATE_BUCKET: "",
      GOOGLE_MAPS_SERVER_KEY: "",
      FIREBASE_API_KEY: "",
      FIREBASE_PROJECT_ID: "",
      FIREBASE_APP_ID: "",
    },
  },
})
