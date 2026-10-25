// The checks that stand between a mistaken command and a production deployment. Pure functions (no network, no process spawning), so
// they are tested exhaustively; scripts/deploy.ts is the thin shell that runs them and, only if they pass, the deploy commands.
// Nothing here ever prints a secret: findings name the variable and the problem, never the value.

export type Target = "staging" | "production"
export const TARGETS: readonly Target[] = ["staging", "production"]
export type Component = "all" | "tracker" | "app" | "cron"

export const DOMAIN: Record<Target, string> = { production: "tany.in", staging: "tanystaging.in" }
export const WORKER_NAMES: Record<Target, { app: string; tracker: string; cron: string }> = {
  production: { app: "tanyapps", tracker: "tanyapps-tracker", cron: "tanyapps-cron" },
  staging: { app: "tanyapps-staging", tracker: "tanyapps-tracker-staging", cron: "tanyapps-cron-staging" },
}

/** The exact sentence a person must supply to deploy to production. It names the domain, so it cannot be pasted from a staging command. */
export const confirmationPhrase = (target: Target) => `deploy ${target} ${DOMAIN[target]}`

export type Parsed =
  | { ok: true; target: Target; component: Component; preflightOnly: boolean; dryRun: boolean; confirm: string | null; migrationsApplied: boolean; envFile: string | null; whoamiFile: string | null }
  | { ok: false; error: string }

export const USAGE = [
  "usage: pnpm run deploy <staging|production> [options]    deploy everything, in order (note: `pnpm deploy` without `run` is a different, built-in pnpm command)",
  "       pnpm run deploy:preflight <staging|production>      run every check, deploy nothing",
  "       pnpm run deploy:tracker|deploy:app|deploy:cron <staging|production>   one component",
  "options: --dry-run (print what would run)   --secrets-file <path> (default .env.staging for staging; REQUIRED for production)",
  '         production also needs  --confirm "deploy production tany.in"  and  --migrations-applied',
].join("\n")

/** There is no default environment: a missing or unknown one is an error, never "production". */
export function parseArgs(argv: string[], component: Component = "all", preflightOnly = false): Parsed {
  const rest = [...argv]
  const target = rest.shift()
  if (!target) return { ok: false, error: `No environment given. Choose one explicitly.\n${USAGE}` }
  if (!(TARGETS as readonly string[]).includes(target)) return { ok: false, error: `Unknown environment "${target.slice(0, 30)}". Choose staging or production.\n${USAGE}` }
  const out = { ok: true as const, target: target as Target, component, preflightOnly, dryRun: false, confirm: null as string | null, migrationsApplied: false, envFile: null as string | null, whoamiFile: null as string | null }
  while (rest.length) {
    const a = rest.shift() as string
    if (a === "--dry-run") out.dryRun = true
    else if (a === "--preflight") out.preflightOnly = true
    else if (a === "--migrations-applied") out.migrationsApplied = true
    else if (a === "--confirm") out.confirm = rest.shift() ?? ""
    else if (a === "--secrets-file") out.envFile = rest.shift() ?? null
    else if (a === "--whoami-file") out.whoamiFile = rest.shift() ?? null
    else return { ok: false, error: `Unknown option "${a.slice(0, 40)}".\n${USAGE}` }
  }
  return out
}

/** JSON with comments (wrangler.jsonc) to a value. Handles // and /* *\/ outside strings. */
export function parseJsonc(text: string): unknown {
  let out = ""
  let inStr = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      out += c
      if (c === "\\") out += text[++i] ?? ""
      else if (c === '"') inStr = false
    } else if (c === '"') {
      inStr = true
      out += c
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
      out += "\n"
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i++
    } else out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
}

type WorkerConfig = { name?: string; vars?: Record<string, string>; routes?: ({ pattern?: string } | string)[]; env?: Record<string, WorkerConfig> }
export type Configs = { app: WorkerConfig; tracker: WorkerConfig; cron: WorkerConfig }

export type EnvMap = Record<string, string | undefined>

/** Reads KEY=VALUE lines (quotes stripped, last assignment wins). Only for a file the person named; never .env.local by itself. */
export function parseEnvFile(text: string): EnvMap {
  const out: EnvMap = {}
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  return out
}

const hostOf = (url: string | undefined): string | null => {
  try {
    return url ? new URL(url).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/** Variables that exist only for development and testing and must never reach a deployed environment. */
const DEV_ONLY = ["RAZORPAY_ALLOW_DIRECT", "GEO_FIXTURE", "E2E", "LOCAL_ADMIN_PASSWORD", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_TEST_PHONES", "TEST_DATABASE_URL", "TEST_DATABASE_MIGRATE_URL", "TEST_DATABASE_DISPOSABLE", "TEST_DATABASE_CONFIRM"]

const routesOf = (c: WorkerConfig): string[] => (c.routes ?? []).map((r) => (typeof r === "string" ? r : (r.pattern ?? "")))
const configFor = (c: WorkerConfig, target: Target): WorkerConfig => (target === "staging" ? { ...(c.env?.staging ?? {}), vars: { ...(c.env?.staging?.vars ?? {}) } } : c)

export type Finding = { level: "block" | "note"; message: string }

/**
 * Everything that can be checked without touching Cloudflare or a database. `env` is the target's own secrets file (as a map). A
 * "block" stops the deployment; a "note" is information. No finding ever contains a secret value.
 */
export function checkTarget(target: Target, env: EnvMap, configs: Configs): Finding[] {
  const f: Finding[] = []
  const block = (message: string) => f.push({ level: "block", message })
  const note = (message: string) => f.push({ level: "note", message })
  const domain = DOMAIN[target]
  const other: Target = target === "production" ? "staging" : "production"

  // --- Razorpay: the key mode must match the environment, in both directions ---
  const key = env.RAZORPAY_KEY_ID ?? ""
  if (!key) block("RAZORPAY_KEY_ID is missing.")
  else if (target === "production" && key.startsWith("rzp_test_")) block("RAZORPAY_KEY_ID is a TEST key. Production would not take real money.")
  else if (target === "production" && !key.startsWith("rzp_live_")) block("RAZORPAY_KEY_ID is not a live key (rzp_live_...).")
  else if (target === "staging" && key.startsWith("rzp_live_")) block("RAZORPAY_KEY_ID is a LIVE key. Staging must never take real money.")
  else if (target === "staging" && !key.startsWith("rzp_test_")) block("RAZORPAY_KEY_ID is not a test key (rzp_test_...).")
  else note(`Razorpay key mode: ${target === "production" ? "live" : "test"} (matches ${target})`)
  if (!env.RAZORPAY_KEY_SECRET) block("RAZORPAY_KEY_SECRET is missing.")
  if ((env.RAZORPAY_WEBHOOK_SECRET ?? "").length < 16) block("RAZORPAY_WEBHOOK_SECRET is missing or too short (the webhook for this environment's mode needs its own secret).")

  // --- never in a deployed environment ---
  for (const k of DEV_ONLY) if (env[k]) block(`${k} is set. It is for development and testing only and must not be deployed.`)
  if (env.NODE_ENV === "development") block("NODE_ENV is development.")

  // --- the database ---
  const db = hostOf(env.DATABASE_URL)
  if (!env.DATABASE_URL) block("DATABASE_URL is missing.")
  else if (!db) block("DATABASE_URL is not a valid URL.")
  else {
    if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(db)) block("DATABASE_URL points at this machine.")
    const denied = (env[target === "production" ? "TANY_NONPRODUCTION_DB_HOSTS" : "TANY_PRODUCTION_DB_HOSTS"] ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)
    if (denied.includes(db)) block(`DATABASE_URL is a ${other} database host. A ${target} deployment must use its own.`)
    let name = ""
    let user = ""
    try {
      const u = new URL(env.DATABASE_URL as string)
      name = u.pathname.replace(/^\//, "").toLowerCase()
      user = decodeURIComponent(u.username).toLowerCase()
    } catch {
      /* already reported */
    }
    if (target === "production" && /(^|[_-])(test|qa|ci|scratch|disposable)([_-]|$)/.test(`${name} ${user}`)) block("DATABASE_URL names a test or disposable database/role. Production must not point at one.")
  }

  // --- the domain, in the secrets file and in the worker configuration ---
  if (env.ROOT_DOMAIN && env.ROOT_DOMAIN !== domain) block(`ROOT_DOMAIN is ${env.ROOT_DOMAIN}, but ${target} is ${domain}.`)
  const app = configFor(configs.app, target)
  const tracker = configFor(configs.tracker, target)
  const cron = configFor(configs.cron, target)
  const w = WORKER_NAMES[target]
  if (app.name !== w.app) block(`The app worker would be named "${app.name}", expected "${w.app}".`)
  if (tracker.name !== w.tracker) block(`The tracker worker would be named "${tracker.name}", expected "${w.tracker}".`)
  if (cron.name !== w.cron) block(`The cron worker would be named "${cron.name}", expected "${w.cron}".`)
  if (app.vars?.ROOT_DOMAIN !== domain) block(`The app's ROOT_DOMAIN in wrangler.jsonc is "${app.vars?.ROOT_DOMAIN}", expected "${domain}".`)
  if (cron.vars?.CRON_TARGET_URL !== `https://app.${domain}`) block(`The cron worker would call "${cron.vars?.CRON_TARGET_URL}", expected "https://app.${domain}".`)
  for (const [label, c] of [["app", app], ["tracker", tracker]] as const) {
    for (const r of routesOf(c)) {
      const ofOther = target === "staging" ? !r.includes(DOMAIN.staging) : r.includes(DOMAIN.staging)
      if (r && ofOther) block(`The ${label} route "${r}" belongs to ${other}, not ${target}.`)
    }
  }
  if (!app.vars?.R2_ACCOUNT_ID) block("The app has no R2_ACCOUNT_ID, so the Cloudflare account cannot be verified.")
  else note(`Cloudflare account expected: ${app.vars.R2_ACCOUNT_ID.slice(0, 4)}...${app.vars.R2_ACCOUNT_ID.slice(-4)}`)

  if (!env.CRON_SECRET) block("CRON_SECRET is missing (the cron worker and the app must share it).")
  return f
}

/** Account ids that a `wrangler whoami` output lists (32 hex characters). */
export const accountIdsFromWhoami = (text: string): string[] => [...new Set(text.toLowerCase().match(/\b[0-9a-f]{32}\b/g) ?? [])]

/** The account this login can deploy to must include the one the configuration expects. */
export function checkAccount(expected: string | undefined, whoami: string, envAccount: string | undefined): Finding[] {
  const f: Finding[] = []
  if (!expected) return [{ level: "block", message: "No expected Cloudflare account to compare with." }]
  const ids = accountIdsFromWhoami(whoami)
  if (ids.length === 0) f.push({ level: "block", message: "Could not read any Cloudflare account from `wrangler whoami`. Run `npx wrangler login`." })
  else if (!ids.includes(expected.toLowerCase())) f.push({ level: "block", message: "This Cloudflare login cannot see the account the configuration deploys to. Sign in with the right account (`npx wrangler logout`, then `npx wrangler login`)." })
  if (envAccount && envAccount.toLowerCase() !== expected.toLowerCase()) f.push({ level: "block", message: "CLOUDFLARE_ACCOUNT_ID in the environment is not the account the configuration deploys to." })
  return f
}

/** Production never proceeds without the typed sentence and an explicit statement that the migrations are done. */
export function checkProductionConsent(confirm: string | null, migrationsApplied: boolean): Finding[] {
  const f: Finding[] = []
  if (confirm !== confirmationPhrase("production")) f.push({ level: "block", message: `Production needs --confirm "${confirmationPhrase("production")}" typed out.` })
  if (!migrationsApplied) f.push({ level: "block", message: "Production needs --migrations-applied: the database migrations must be applied BEFORE the application is deployed." })
  return f
}

/** What would run, in order, with the environment spelled out for every command (never left to a default). */
export function plan(target: Target, component: Component): string[] {
  const env = target === "staging" ? "--env staging" : '--env=""'
  const steps: Record<Exclude<Component, "all">, string[]> = {
    tracker: [`wrangler deploy -c workers/tracker/wrangler.jsonc ${env}`],
    app: ["opennextjs-cloudflare build", `opennextjs-cloudflare deploy ${target === "staging" ? "--env staging" : ""}`.trim()],
    cron: [`wrangler deploy -c workers/cron/wrangler.jsonc ${env}`],
  }
  const order: Exclude<Component, "all">[] = component === "all" ? ["tracker", "app", "cron"] : [component]
  return [`bash scripts/predeploy-check.sh ${target}`, ...order.flatMap((c) => steps[c])]
}
