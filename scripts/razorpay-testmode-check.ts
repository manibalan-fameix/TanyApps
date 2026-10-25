// Offline pre-flight for Razorpay TEST-mode staging runs: `pnpm razorpay:check`.
// Reads explicit environment variables only (no .env file, never .env.local) and makes NO network call: it moves no money and
// creates nothing at Razorpay. It refuses anything that could be live or production. Prints modes and host names, never keys.
const env = process.env
const problems: string[] = []
const notes: string[] = []

const keyId = env.RAZORPAY_KEY_ID?.trim() ?? ""
if (!keyId) problems.push("RAZORPAY_KEY_ID is not set.")
else if (keyId.startsWith("rzp_live_")) problems.push("RAZORPAY_KEY_ID is a LIVE key (rzp_live_). Staging tests use test keys only (rzp_test_).")
else if (!keyId.startsWith("rzp_test_")) problems.push("RAZORPAY_KEY_ID is not a test key: it must start with rzp_test_.")
else notes.push("API key: test mode")

if (!env.RAZORPAY_KEY_SECRET?.trim()) problems.push("RAZORPAY_KEY_SECRET is not set.")
const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? ""
if (webhookSecret.length < 16) problems.push("RAZORPAY_WEBHOOK_SECRET must be a long random string (16+ characters) shared with the TEST-mode webhook.")
else notes.push("Webhook secret: set")

const root = env.ROOT_DOMAIN?.trim() ?? ""
if (!root) problems.push("ROOT_DOMAIN is not set.")
else if (root === "tany.in" || root.endsWith(".tany.in")) problems.push(`ROOT_DOMAIN is ${root}, which is production. Staging uses tanystaging.in.`)
else notes.push(`Webhook URL to register in Razorpay TEST mode: https://app.${root}/api/webhooks/razorpay`)

if (env.RAZORPAY_ALLOW_DIRECT === "1") notes.push("RAZORPAY_ALLOW_DIRECT=1: payments may skip the linked account (test keys only). Booking refunds always use Route, so also set up a test linked account.")
if (!env.CRON_SECRET?.trim()) notes.push("CRON_SECRET is not set here: you need it only to trigger the refund job by hand (see the runbook).")

for (const n of notes) console.log(`ok    ${n}`)
for (const p of problems) console.error(`FAIL  ${p}`)
if (problems.length) {
  console.error("\nNothing was sent to Razorpay. Fix the above, then run this again.")
  process.exit(1)
}
console.log("\nTest-mode configuration looks safe. No request was made to Razorpay.")
