// Guards the properties of the GitHub workflows that matter for safety, so a later edit cannot quietly remove them. This reads the
// files only; whether a workflow actually passes is known only when it runs on GitHub.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const DIR = path.resolve(__dirname, "../.github/workflows")
const files = readdirSync(DIR).filter((f) => f.endsWith(".yml"))
const read = (f: string) => readFileSync(path.join(DIR, f), "utf8")
const ci = read("ci.yml")

describe("every workflow", () => {
  it.each(files)("%s pins each third-party action to a full commit SHA", (f) => {
    const refs = [...read(f).matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1])
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(ref, `${f}: ${ref}`).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/)
  })
  it.each(files)("%s never uses pull_request_target and declares least-privilege permissions", (f) => {
    const text = read(f)
    expect(text).not.toMatch(/pull_request_target/)
    expect(text).toMatch(/^permissions:\n  contents: read/m)
    expect(text).not.toMatch(/permissions:[\s\S]{0,80}(write-all|contents: write|pull-requests: write|id-token)/)
  })
})

describe("ci.yml", () => {
  it("runs on pull requests and on main only, with no secrets and no production reference", () => {
    expect(ci).toMatch(/^on:\n  pull_request:\n  push:\n    branches: \[main\]/m)
    expect(ci).not.toMatch(/\$\{\{\s*secrets\./)
    // TEST_DATABASE_URL (the throwaway database) is expected; the application's DATABASE_URL and any provider credential are not.
    expect(ci).not.toMatch(/(?<!TEST_)DATABASE_URL|\.env\.local|CLOUDFLARE_API_TOKEN|RAZORPAY_/)
  })
  it("gives every job a timeout and does not persist the checkout token", () => {
    const jobs = ci.split(/^  [a-z-]+:\n    runs-on/m).length - 1
    expect([...ci.matchAll(/timeout-minutes:/g)].length).toBe(jobs)
    expect([...ci.matchAll(/persist-credentials: false/g)].length).toBe([...ci.matchAll(/actions\/checkout@/g)].length)
  })
  it("uses a throwaway Postgres that satisfies the disposable-database guard", () => {
    expect(ci).toMatch(/services:\n\s+postgres:/)
    expect(ci).toMatch(/TEST_DATABASE_DISPOSABLE: "1"/)
    expect(ci).toMatch(/TEST_DATABASE_CONFIRM: tany_ci_test/)
    expect(ci).toMatch(/NOSUPERUSER/)
    expect(ci).toMatch(/COMMENT ON DATABASE tany_ci_test IS 'tany:disposable-test-db'/)
    expect(ci).toMatch(/localhost:5432/)
  })
  it("installs from the lockfile and runs every gate in order", () => {
    const order = [
      "pnpm install --frozen-lockfile",
      "pnpm audit --prod --audit-level=high",
      "pnpm typecheck",
      "pnpm lint",
      "pnpm build",
      "pnpm test:db check",
      "pnpm test:db migrate",
      "pnpm test:db test",
    ]
    let at = -1
    for (const step of order) {
      const i = ci.indexOf(step, at + 1)
      expect(i, `missing or out of order: ${step}`).toBeGreaterThan(at)
      at = i
    }
  })
  it("builds the Worker bundle and dry-runs all three Wrangler configs without uploading", () => {
    expect(ci).toMatch(/opennextjs-cloudflare build/)
    for (const cfg of ["wrangler.jsonc", "workers/tracker/wrangler.jsonc", "workers/cron/wrangler.jsonc"]) {
      expect(ci).toMatch(new RegExp(`wrangler deploy -c ${cfg.replace(/[./]/g, "\\$&")} --dry-run`))
    }
    expect(ci).not.toMatch(/wrangler deploy(?![^\n]*--dry-run)/)
  })
})
