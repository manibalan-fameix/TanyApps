// The only door to Cloudflare. There is no default environment: you must say staging or production, every check in lib/deploy/guard.ts must
// pass, and production needs a typed confirmation. Nothing here prints a secret (findings name the variable, never its value).
//
//   pnpm run deploy staging|production [--dry-run]       everything, in order: tracker, app, cron
//   pnpm run deploy:preflight staging|production         run every check, deploy nothing
//   pnpm run deploy:tracker|deploy:app|deploy:cron <env> one component
//
// Production also needs:  --confirm "deploy production tany.in"  --migrations-applied
// The secrets file is .env.staging for staging by default; production has no default and needs --secrets-file <path>.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

import { accountIdsFromWhoami, checkAccount, checkProductionConsent, checkTarget, type Component, type Configs, DOMAIN, type Finding, parseArgs, parseEnvFile, parseJsonc, plan } from "../lib/deploy/guard.ts"

const mode = process.argv[2] as string | undefined
const component: Component = mode === "tracker" || mode === "app" || mode === "cron" ? mode : "all"
const parsed = parseArgs(process.argv.slice(3), component, mode === "preflight")
if (!parsed.ok) {
  console.error(parsed.error)
  process.exit(2)
}
const { target } = parsed

const load = (p: string) => parseJsonc(readFileSync(p, "utf8")) as Configs["app"]
const configs: Configs = { app: load("wrangler.jsonc"), tracker: load("workers/tracker/wrangler.jsonc"), cron: load("workers/cron/wrangler.jsonc") }

// Staging has a conventional file. Production has NONE by default: the secrets file is never chosen for you, so no command, script or
// automation can read production's secrets without naming the file on purpose (and nothing here ever opens .env.local by itself).
const envFile = parsed.envFile ?? (target === "staging" ? ".env.staging" : null)
const findings: Finding[] = []
if (!envFile) findings.push({ level: "block", message: 'Production needs --secrets-file <path>: its secrets file is never chosen for you (pass .env.local only if that is deliberately the file).' })
else if (!existsSync(envFile)) findings.push({ level: "block", message: `The secrets file "${envFile}" was not found.` })
const env = envFile && existsSync(envFile) ? parseEnvFile(readFileSync(envFile, "utf8")) : {}
findings.push(...checkTarget(target, env, configs))

// Which Cloudflare account is this login? Read-only. (--whoami-file lets the checks be tested without a login.)
let whoami = ""
if (parsed.whoamiFile) whoami = readFileSync(parsed.whoamiFile, "utf8")
else {
  const r = spawnSync("pnpm", ["exec", "wrangler", "whoami"], { encoding: "utf8" })
  whoami = `${r.stdout ?? ""}\n${r.stderr ?? ""}`
}
const expectedAccount = (target === "staging" ? configs.app.env?.staging?.vars : configs.app.vars)?.R2_ACCOUNT_ID
findings.push(...checkAccount(expectedAccount, whoami, process.env.CLOUDFLARE_ACCOUNT_ID))
console.log(`Cloudflare accounts visible to this login: ${accountIdsFromWhoami(whoami).length}`)

const mutating = !parsed.preflightOnly && !parsed.dryRun
if (target === "production" && mutating) findings.push(...checkProductionConsent(parsed.confirm, parsed.migrationsApplied))

console.log(`Environment: ${target} (${DOMAIN[target]})   secrets file: ${envFile ?? "(none given)"}`)
for (const x of findings) console.log(`${x.level === "block" ? "BLOCKED" : "ok     "}  ${x.message}`)
const blocked = findings.filter((x) => x.level === "block").length
if (blocked) {
  console.error(`\n${blocked} problem(s). Nothing was deployed.`)
  process.exit(1)
}

const steps = plan(target, parsed.component)
if (parsed.preflightOnly) {
  console.log("\nPreflight passed. Nothing was deployed. Steps a real run would take:")
  for (const s of steps) console.log(`  ${s}`)
  process.exit(0)
}
if (parsed.dryRun) {
  console.log("\n--dry-run: would run, in order:")
  for (const s of steps) console.log(`  ${s}`)
  if (target === "production") console.log(`A real production run also needs --confirm "deploy production tany.in" and --migrations-applied.`)
  process.exit(0)
}
for (const s of steps) {
  console.log(`\n$ ${s}`)
  const [cmd, ...args] = s.split(" ")
  const r = spawnSync(cmd === "bash" ? "bash" : "pnpm", cmd === "bash" ? args : ["exec", cmd, ...args.map((a) => (a === '--env=""' ? "--env=" : a))], { stdio: "inherit" })
  if (r.status !== 0) {
    console.error(`\nStopped: "${s}" failed. Later steps were not run.`)
    process.exit(r.status ?? 1)
  }
}
console.log(`\nDeployed ${parsed.component} to ${target}. Run the smoke tests in docs/release/PRODUCTION-RELEASE.md.`)
