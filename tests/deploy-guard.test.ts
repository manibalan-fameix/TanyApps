import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import { accountIdsFromWhoami, checkAccount, checkProductionConsent, checkTarget, type Configs, confirmationPhrase, type EnvMap, parseArgs, parseEnvFile, parseJsonc, plan } from "../lib/deploy/guard"

const MARK = "SECRETMARK9f3a" // appears in every fixture secret; it must never appear in any output
const load = (p: string) => parseJsonc(readFileSync(p, "utf8")) as Configs["app"]
let configs: Configs
let account: string

const goodStaging = (): EnvMap => ({ RAZORPAY_KEY_ID: `rzp_test_${MARK}`, RAZORPAY_KEY_SECRET: `${MARK}-secret`, RAZORPAY_WEBHOOK_SECRET: `${MARK}-webhook-0123456789`, DATABASE_URL: `postgres://tany_user:${MARK}@ep-stage.neon.tech/tany_staging`, CRON_SECRET: `${MARK}-cron`, ROOT_DOMAIN: "tanystaging.in", TANY_PRODUCTION_DB_HOSTS: "ep-prod.neon.tech" })
const goodProd = (): EnvMap => ({ RAZORPAY_KEY_ID: `rzp_live_${MARK}`, RAZORPAY_KEY_SECRET: `${MARK}-secret`, RAZORPAY_WEBHOOK_SECRET: `${MARK}-webhook-0123456789`, DATABASE_URL: `postgres://tany_user:${MARK}@ep-prod.neon.tech/tany`, CRON_SECRET: `${MARK}-cron`, ROOT_DOMAIN: "tany.in", TANY_NONPRODUCTION_DB_HOSTS: "ep-stage.neon.tech" })
const blocks = (target: "staging" | "production", env: EnvMap, c = configs) => checkTarget(target, env, c).filter((f) => f.level === "block").map((f) => f.message)

beforeAll(() => {
  configs = { app: load("wrangler.jsonc"), tracker: load("workers/tracker/wrangler.jsonc"), cron: load("workers/cron/wrangler.jsonc") }
  account = configs.app.vars?.R2_ACCOUNT_ID as string
})

describe("there is no default environment", () => {
  it("refuses to run without one, and without a known one", () => {
    expect(parseArgs([])).toMatchObject({ ok: false, error: expect.stringContaining("No environment given") })
    expect(parseArgs(["prod"])).toMatchObject({ ok: false, error: expect.stringContaining("Unknown environment") })
    expect(parseArgs([""])).toMatchObject({ ok: false })
    expect(parseArgs(["--dry-run"])).toMatchObject({ ok: false, error: expect.stringContaining("Unknown environment") }) // a flag is not an environment
    expect(parseArgs(["PRODUCTION"])).toMatchObject({ ok: false }) // exact, case-sensitive
  })
  it("accepts exactly staging and production, with their options", () => {
    expect(parseArgs(["staging", "--dry-run"])).toMatchObject({ ok: true, target: "staging", dryRun: true, confirm: null, migrationsApplied: false })
    expect(parseArgs(["production", "--confirm", "x", "--migrations-applied"])).toMatchObject({ ok: true, target: "production", confirm: "x", migrationsApplied: true })
    expect(parseArgs(["staging", "--surprise"])).toMatchObject({ ok: false })
  })
})

describe("the repository's own configuration is consistent, per environment", () => {
  it("passes for a correct staging and a correct production environment", () => {
    expect(blocks("staging", goodStaging())).toEqual([])
    expect(blocks("production", goodProd())).toEqual([])
  })
  it("catches a staging configuration that would touch production (names, routes, domains, cron target)", () => {
    const bad = structuredClone(configs)
    bad.app.env!.staging.routes = [{ pattern: "app.tany.in", custom_domain: true } as never]
    expect(blocks("staging", goodStaging(), bad).join(" ")).toContain("belongs to production")
    const badName = structuredClone(configs)
    badName.cron.env!.staging.name = "tanyapps-cron"
    expect(blocks("staging", goodStaging(), badName).join(" ")).toContain("cron worker would be named")
    const badCron = structuredClone(configs)
    badCron.cron.env!.staging.vars!.CRON_TARGET_URL = "https://app.tany.in"
    expect(blocks("staging", goodStaging(), badCron).join(" ")).toContain("cron worker would call")
    const badDomain = structuredClone(configs)
    badDomain.app.env!.staging.vars!.ROOT_DOMAIN = "tany.in"
    expect(blocks("staging", goodStaging(), badDomain).join(" ")).toContain("ROOT_DOMAIN in wrangler.jsonc")
  })
  it("catches a production configuration that would touch staging", () => {
    const bad = structuredClone(configs)
    bad.tracker.routes = [{ pattern: "track.tanystaging.in", custom_domain: true } as never]
    expect(blocks("production", goodProd(), bad).join(" ")).toContain("belongs to staging")
  })
})

describe("payment credentials must match the environment, in both directions", () => {
  it("production refuses a test key; staging refuses a live key", () => {
    expect(blocks("production", { ...goodProd(), RAZORPAY_KEY_ID: `rzp_test_${MARK}` }).join(" ")).toContain("TEST key")
    expect(blocks("staging", { ...goodStaging(), RAZORPAY_KEY_ID: `rzp_live_${MARK}` }).join(" ")).toContain("LIVE key")
  })
  it("refuses a missing or odd key and a missing or short webhook secret", () => {
    for (const t of ["staging", "production"] as const) {
      const base = t === "staging" ? goodStaging() : goodProd()
      expect(blocks(t, { ...base, RAZORPAY_KEY_ID: "" }).join(" ")).toContain("RAZORPAY_KEY_ID is missing")
      expect(blocks(t, { ...base, RAZORPAY_KEY_ID: "key_abc" }).length).toBeGreaterThan(0)
      expect(blocks(t, { ...base, RAZORPAY_WEBHOOK_SECRET: "short" }).join(" ")).toContain("RAZORPAY_WEBHOOK_SECRET")
      expect(blocks(t, { ...base, RAZORPAY_KEY_SECRET: "" }).join(" ")).toContain("RAZORPAY_KEY_SECRET")
    }
  })
})

describe("databases and development-only settings", () => {
  it("refuses the other environment's database host, a local one, and a test database in production", () => {
    expect(blocks("production", { ...goodProd(), DATABASE_URL: "postgres://u:p@ep-stage.neon.tech/tany" }).join(" ")).toContain("staging database host")
    expect(blocks("staging", { ...goodStaging(), DATABASE_URL: "postgres://u:p@ep-prod.neon.tech/tany" }).join(" ")).toContain("production database host")
    expect(blocks("staging", { ...goodStaging(), DATABASE_URL: "postgres://u:p@localhost/tany" }).join(" ")).toContain("this machine")
    expect(blocks("production", { ...goodProd(), DATABASE_URL: "postgres://tany_test_user:p@ep-x.neon.tech/tany_test" }).join(" ")).toContain("test or disposable")
    expect(blocks("production", { ...goodProd(), DATABASE_URL: "" }).join(" ")).toContain("DATABASE_URL is missing")
  })
  it("refuses development and test switches in any deployed environment", () => {
    for (const k of ["RAZORPAY_ALLOW_DIRECT", "GEO_FIXTURE", "E2E", "LOCAL_ADMIN_PASSWORD", "TEST_DATABASE_URL", "TEST_DATABASE_DISPOSABLE"]) {
      for (const t of ["staging", "production"] as const) expect(blocks(t, { ...(t === "staging" ? goodStaging() : goodProd()), [k]: "1" }).join(" ")).toContain(k)
    }
  })
  it("refuses a ROOT_DOMAIN from the other environment", () => {
    expect(blocks("production", { ...goodProd(), ROOT_DOMAIN: "tanystaging.in" }).join(" ")).toContain("ROOT_DOMAIN is tanystaging.in")
    expect(blocks("staging", { ...goodStaging(), ROOT_DOMAIN: "tany.in" }).join(" ")).toContain("ROOT_DOMAIN is tany.in")
  })
})

describe("the Cloudflare account and the production consent", () => {
  const who = (ids: string[]) => `Getting User settings...\n${ids.map((i) => `│ My Account │ ${i} │`).join("\n")}`
  it("accepts a login that can see the expected account, and rejects any other, or none", () => {
    expect(checkAccount(account, who([account]), undefined)).toEqual([])
    expect(checkAccount(account, who(["0".repeat(32), account]), undefined)).toEqual([])
    expect(checkAccount(account, who(["a".repeat(32)]), undefined)[0].message).toContain("cannot see the account")
    expect(checkAccount(account, "You are not authenticated", undefined)[0].message).toContain("wrangler login")
    expect(checkAccount(account, who([account]), "b".repeat(32))[0].message).toContain("CLOUDFLARE_ACCOUNT_ID")
    expect(checkAccount(undefined, who([account]), undefined)).toHaveLength(1)
    expect(accountIdsFromWhoami(who([account, account]))).toEqual([account])
  })
  it("production needs the typed sentence naming the domain, and the migrations statement", () => {
    expect(confirmationPhrase("production")).toBe("deploy production tany.in")
    expect(checkProductionConsent(null, false)).toHaveLength(2)
    expect(checkProductionConsent("deploy production tany.in", false)).toHaveLength(1)
    expect(checkProductionConsent("deploy staging tanystaging.in", true)).toHaveLength(1) // pasted from the staging command: not enough
    expect(checkProductionConsent("yes", true)).toHaveLength(1)
    expect(checkProductionConsent("deploy production tany.in", true)).toEqual([])
  })
})

describe("every step names its environment, and the checks run first", () => {
  it("staging steps all say --env staging", () => {
    const steps = plan("staging", "all")
    expect(steps[0]).toBe("bash scripts/predeploy-check.sh staging")
    for (const s of steps.filter((x) => x.includes("deploy") && !x.startsWith("bash"))) expect(s).toContain("--env staging")
  })
  it("production steps are explicit (--env=\"\"), start with the predeploy check, and go tracker, app, cron", () => {
    const steps = plan("production", "all")
    expect(steps[0]).toBe("bash scripts/predeploy-check.sh production")
    expect(steps.filter((s) => s.startsWith("wrangler deploy")).every((s) => s.endsWith('--env=""'))).toBe(true)
    expect(steps.map((s) => (s.includes("tracker") ? "tracker" : s.includes("cron") ? "cron" : s.includes("opennext") ? "app" : "check"))).toEqual(["check", "tracker", "app", "app", "cron"])
  })
  it("one component plans only that component", () => {
    expect(plan("staging", "cron")).toEqual(["bash scripts/predeploy-check.sh staging", "wrangler deploy -c workers/cron/wrangler.jsonc --env staging"])
  })
})

describe("no finding ever contains a secret", () => {
  it("holds for every kind of failure", () => {
    for (const env of [goodStaging(), { ...goodStaging(), RAZORPAY_KEY_ID: `rzp_live_${MARK}`, DATABASE_URL: `postgres://u:${MARK}@localhost/x`, E2E: MARK }]) {
      expect(JSON.stringify(checkTarget("staging", env, configs))).not.toContain(MARK)
    }
    expect(JSON.stringify(checkTarget("production", { ...goodProd(), RAZORPAY_KEY_ID: `rzp_test_${MARK}`, DATABASE_URL: `postgres://tany_test_user:${MARK}@x.neon.tech/tany_test` }, configs))).not.toContain(MARK)
  })
  it("parses an env file without exposing anything beyond the map", () => {
    expect(parseEnvFile('A=1\nexport B="two"\n# C=3\nD=\'x\'')).toEqual({ A: "1", B: "two", D: "x" })
  })
})

describe("the command line", () => {
  let dir: string
  let whoami: string
  const files = (name: string, env: EnvMap) => {
    const p = path.join(dir, name)
    writeFileSync(p, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n"))
    return p
  }
  const run = (args: string[]) => {
    const r = spawnSync("node", ["scripts/deploy.ts", ...args], { encoding: "utf8", cwd: process.cwd(), env: { ...process.env, PATH: process.env.PATH } })
    return { code: r.status, out: `${r.stdout}${r.stderr}` }
  }
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "deploy-guard-"))
    whoami = path.join(dir, "whoami.txt")
    writeFileSync(whoami, `Accounts\n${account}\n`)
  })

  it("`deploy` with no environment, or with an unknown one, does nothing and exits non-zero", () => {
    for (const args of [["all"], ["all", "prod"], ["all", "--dry-run"], ["preflight"]]) {
      const r = run(args)
      expect([args, r.code]).toEqual([args, 2])
      expect(r.out).toMatch(/No environment given|Unknown environment/)
      expect(r.out).not.toMatch(/Deployed|\$ /)
    }
  })
  it("production never picks a secrets file for itself: without --secrets-file it is blocked, and no file is read", () => {
    for (const args of [["all", "production", "--whoami-file", whoami, "--dry-run"], ["preflight", "production", "--whoami-file", whoami], ["cron", "production", "--whoami-file", whoami, "--dry-run"]]) {
      const r = run(args)
      expect([args[0], r.code]).toEqual([args[0], 1])
      expect(r.out).toContain("Production needs --secrets-file")
      expect(r.out).toContain("secrets file: (none given)")
      expect(r.out).not.toMatch(/localhost|\.env\.local was|ROOT_DOMAIN is/) // nothing from any default file leaked into the report
    }
  })
  it("a missing secrets file blocks it", () => {
    const r = run(["all", "staging", "--secrets-file", path.join(dir, "nope.env"), "--whoami-file", whoami, "--dry-run"])
    expect(r.code).toBe(1)
    expect(r.out).toContain("was not found")
  })
  it("a staging deploy with a live Razorpay key is blocked, and the key is not printed", () => {
    const f = files("staging-live.env", { ...goodStaging(), RAZORPAY_KEY_ID: `rzp_live_${MARK}` })
    const r = run(["all", "staging", "--secrets-file", f, "--whoami-file", whoami, "--dry-run"])
    expect(r.code).toBe(1)
    expect(r.out).toContain("LIVE key")
    expect(r.out).not.toContain(MARK)
  })
  it("a production deploy with a test key is blocked", () => {
    const f = files("prod-test.env", { ...goodProd(), RAZORPAY_KEY_ID: `rzp_test_${MARK}` })
    const r = run(["all", "production", "--secrets-file", f, "--whoami-file", whoami, "--dry-run"])
    expect(r.code).toBe(1)
    expect(r.out).toContain("TEST key")
  })
  it("a real production run without the confirmation is blocked BEFORE any step runs", () => {
    const f = files("prod-good.env", goodProd())
    const r = run(["all", "production", "--secrets-file", f, "--whoami-file", whoami])
    expect(r.code).toBe(1)
    expect(r.out).toContain('--confirm "deploy production tany.in"')
    expect(r.out).toContain("--migrations-applied")
    expect(r.out).not.toMatch(/\$ |Deployed/)
  })
  it("a real production run with the wrong confirmation is blocked", () => {
    const f = files("prod-good2.env", goodProd())
    const r = run(["all", "production", "--secrets-file", f, "--whoami-file", whoami, "--confirm", "deploy staging tanystaging.in", "--migrations-applied"])
    expect(r.code).toBe(1)
    expect(r.out).not.toMatch(/\$ |Deployed/)
  })
  it("the wrong Cloudflare account is blocked", () => {
    const f = files("staging-good.env", goodStaging())
    const wrong = path.join(dir, "whoami-wrong.txt")
    writeFileSync(wrong, `Accounts\n${"a".repeat(32)}\n`)
    const r = run(["all", "staging", "--secrets-file", f, "--whoami-file", wrong, "--dry-run"])
    expect(r.code).toBe(1)
    expect(r.out).toContain("cannot see the account")
  })
  it("a correct staging preflight passes, deploys nothing, and prints the steps", () => {
    const f = files("staging-ok.env", goodStaging())
    const r = run(["preflight", "staging", "--secrets-file", f, "--whoami-file", whoami])
    expect(r.code).toBe(0)
    expect(r.out).toContain("Preflight passed. Nothing was deployed.")
    expect(r.out).toContain("--env staging")
    expect(r.out).not.toContain(MARK)
    expect(r.out).not.toMatch(/Deployed|\$ /)
  })
  it("a correct production dry run passes and shows what a real run would need, without running anything", () => {
    const f = files("prod-ok.env", goodProd())
    const r = run(["all", "production", "--secrets-file", f, "--whoami-file", whoami, "--dry-run"])
    expect(r.code).toBe(0)
    expect(r.out).toContain("--dry-run: would run")
    expect(r.out).toContain("predeploy-check.sh production")
    expect(r.out).toContain('--env=""')
    expect(r.out).toContain("--migrations-applied")
    expect(r.out).not.toMatch(/Deployed|\$ /)
  })
})

describe("no package script can reach Cloudflare around the guard", () => {
  it("every deploy script goes through scripts/deploy.ts, except the unrelated jarvis worker", () => {
    const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts
    for (const [name, cmd] of Object.entries(scripts)) {
      if (name === "deploy:jarvis") continue
      if (/wrangler deploy|opennextjs-cloudflare deploy/.test(cmd)) throw new Error(`script "${name}" deploys directly: ${cmd}`)
    }
    for (const name of ["deploy", "deploy:staging", "deploy:tracker", "deploy:app", "deploy:cron", "deploy:preflight"]) expect(scripts[name], name).toMatch(/^node scripts\/deploy\.ts /)
    expect(scripts.deploy).toBe("node scripts/deploy.ts all") // the environment comes from the command line; there is none by default
    expect(scripts["deploy:staging"]).toBe("node scripts/deploy.ts all staging")
  })
})
