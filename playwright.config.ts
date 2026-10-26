import { defineConfig, devices } from "@playwright/test"

// Runs against a real Postgres that is already migrated and seeded:
//   pnpm db:migrate && pnpm db:seed && pnpm db:import-variants
// Required env: DATABASE_URL, ENCRYPTION_KEY (the same key the seed used).
// The app starts in development mode (dev sign-in bypass, local-disk storage, mock RC provider)
// on its own port and build directory, so it can run next to a dev server you already have open.
const PORT = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    trace: "retain-on-failure",
  },
  projects: [
    // No camera available: exercises the file-input fallback that older or locked-down phones get.
    // The cab specs need their own server, port and database (and the Firebase emulator): run them with `pnpm test:e2e:cabs` and
    // `pnpm test:e2e:cabs-login`, not under this config.
    { name: "android-chrome", testIgnore: /(camera|cabs-.*)\.spec\.ts/, use: { browserName: "chromium" } },
    // Chromium's fake camera stream: exercises the live getUserMedia path with the on-screen outline.
    {
      name: "android-chrome-camera",
      testMatch: /camera\.spec\.ts/,
      use: {
        browserName: "chromium",
        permissions: ["camera"],
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      E2E: "1",
      ROOT_DOMAIN: `localhost:${PORT}`,
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
      // Force the offline-friendly paths: mock RC, no vision model, local storage.
      RC_PROVIDER: "mock",
      VISION_API_KEY: "",
      R2_BUCKET: "",
      FIREBASE_API_KEY: "",
      FIREBASE_PROJECT_ID: "",
      FIREBASE_APP_ID: "",
    },
  },
})
