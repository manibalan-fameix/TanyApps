// Vitest globalSetup: runs once, before any test file. When live-database tests are requested (TEST_DATABASE_URL set), the
// target must pass every check in disposable-db.ts, including the ones only the server can answer. A failure aborts the run.
import { assertDisposableDatabaseAt, checkTestDatabaseConfig, describeTarget } from "./disposable-db"

export default async function setup(): Promise<void> {
  const checked = checkTestDatabaseConfig()
  if (!checked) return
  await assertDisposableDatabaseAt(checked.url, checked.target)
  console.log(`live-database tests: ${describeTarget(checked.target)} is marked disposable`)
}
