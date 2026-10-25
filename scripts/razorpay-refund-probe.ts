// Razorpay TEST-MODE refund contract probe: `pnpm razorpay:probe -- --payment pay_xxx --i-understand-this-sends-test-mode-refunds`
//
// Establishes, against Razorpay's real TEST API, the refund behaviour the money code depends on (docs/staging/razorpay-test-mode-runbook.md,
// R3-R5), which the public documentation leaves unstated: replay of a key, a key reused with a different body, a key after a refused
// attempt, concurrent identical requests, whether `notes` come back when refunds are listed, and how a refund's status moves.
//
// It needs ONE captured TEST payment (made through Checkout with a test card) of at least INR 5. It does not need the application, a
// database or any deployed Worker.
//
// Safety, enforced in code:
//   - refuses anything but an `rzp_test_` key (a live key stops it before any request);
//   - without --i-understand-this-sends-test-mode-refunds it only READS (checks the payment) and sends no refund;
//   - refunds only small amounts of that one payment; every request and answer is printed with the secrets left out;
//   - the key and secret are never printed, and read only from RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in the environment (no file is read).
import { randomUUID } from "node:crypto"

type Fetch = typeof fetch
export type Outcome = "PASS" | "FAIL" | "INFO"
export type Result = { id: string; outcome: Outcome; what: string; observed: string }

const API = "https://api.razorpay.com"

export async function probe(opts: { env: Record<string, string | undefined>; paymentId: string; send: boolean; fetch?: Fetch; wait?: (ms: number) => Promise<void> }): Promise<Result[]> {
  const f = opts.fetch ?? fetch
  const wait = opts.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const keyId = opts.env.RAZORPAY_KEY_ID ?? ""
  const secret = opts.env.RAZORPAY_KEY_SECRET ?? ""
  const results: Result[] = []
  const rec = (id: string, outcome: Outcome, what: string, observed: string) => void results.push({ id, outcome, what, observed })

  if (!keyId.startsWith("rzp_test_") || !secret) {
    rec("P0", "FAIL", "Only a TEST key may be used", keyId.startsWith("rzp_live_") ? "a LIVE key was supplied: stopped before any request" : "RAZORPAY_KEY_ID is missing or is not an rzp_test_ key: stopped before any request")
    return results
  }
  const auth = `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`
  const call = async (method: "GET" | "POST", path: string, body?: unknown, key?: string) => {
    const res = await f(`${API}${path}`, { method, headers: { authorization: auth, "content-type": "application/json", ...(key ? { "X-Refund-Idempotency": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    let json: Record<string, unknown> | null = null
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      /* not JSON */
    }
    return { status: res.status, json }
  }
  const errOf = (j: Record<string, unknown> | null) => (j?.error as { code?: string; description?: string } | undefined) ?? {}
  const show = (r: { status: number; json: Record<string, unknown> | null }) => `HTTP ${r.status}${r.json?.id ? ` refund ${r.json.id} status=${r.json.status}` : ""}${errOf(r.json).description ? ` "${errOf(r.json).description}" (${errOf(r.json).code ?? "no code"})` : ""}`

  const pay = await call("GET", `/v1/payments/${encodeURIComponent(opts.paymentId)}`)
  const captured = pay.json?.status === "captured" ? (pay.json.amount as number) : 0
  const refunded = (pay.json?.amount_refunded as number | undefined) ?? 0
  if (pay.status !== 200 || !captured) {
    rec("P0", "FAIL", "The payment must exist and be captured", `HTTP ${pay.status}, status=${String(pay.json?.status)}: stopped`)
    return results
  }
  rec("P0", "PASS", "Test key accepted; payment found and captured", `amount ${captured} paise, already refunded ${refunded}, order ${String(pay.json?.order_id)}`)
  if (captured - refunded < 500) {
    rec("P0", "FAIL", "The payment needs at least INR 5 left to refund for this probe", `${captured - refunded} paise left: use a fresh test payment`)
    return results
  }
  if (!opts.send) {
    rec("P0", "INFO", "Read-only mode", "no refund was sent. Re-run with --i-understand-this-sends-test-mode-refunds to run P1-P9")
    return results
  }

  const base = `/v1/payments/${encodeURIComponent(opts.paymentId)}/refund`
  const K = `probe_${randomUUID()}`
  const body = { amount: 100, speed: "normal", notes: { tany_refund_key: K } }

  // P1: a key shorter than the documented minimum is refused, and nothing is created.
  const short = await call("POST", base, body, "short")
  rec("P1", short.status === 400 ? "PASS" : "FAIL", "A key under 10 characters is refused with 400 (documented)", show(short))

  // P2: the first request creates a refund.
  const first = await call("POST", base, body, K)
  const id1 = first.json?.id as string | undefined
  rec("P2", first.status === 200 && id1 ? "PASS" : "FAIL", "First request with a key creates a refund", show(first))
  if (!id1) return results

  // P3: the same key and the identical body returns the SAME refund and creates no second one (documented as safe; the returned object is not).
  const replay = await call("POST", base, body, K)
  rec("P3", replay.status === 200 && replay.json?.id === id1 ? "PASS" : "FAIL", "Same key + identical body returns the same refund", show(replay))

  // P4: the same key with a different body: documented inconsistently (400 BAD_REQUEST in prose, 409 in the error table).
  const changed = await call("POST", base, { ...body, amount: 200 }, K)
  rec("P4", changed.status === 409 || changed.status === 400 ? "PASS" : "FAIL", "Same key + different body is refused (docs say 409 and/or 400)", `${show(changed)}  <- the status the code must expect`)

  // P5: listing the payment's refunds shows ours, and shows whether `notes` come back (the recovery path relies on both).
  const list = await call("GET", `/v1/payments/${encodeURIComponent(opts.paymentId)}/refunds?count=100`)
  const items = (list.json?.items as { id: string; notes?: Record<string, string> | unknown[]; amount?: number }[] | undefined) ?? []
  const mine = items.filter((r) => r.id === id1)
  const noteBack = !Array.isArray(mine[0]?.notes) && (mine[0]?.notes as Record<string, string> | undefined)?.tany_refund_key === K
  rec("P5", mine.length === 1 ? "PASS" : "FAIL", "The refund appears exactly once when the payment's refunds are listed", `${items.length} refund(s) listed, ours present ${mine.length}x`)
  rec("P5b", noteBack ? "PASS" : "FAIL", "The refund's notes (our key) come back from the list, which reconciliation relies on", noteBack ? "notes echoed" : `notes NOT echoed: ${JSON.stringify(mine[0]?.notes ?? null)}; reconciliation must not depend on them`)

  // P6: fetch the refund, and watch its status for a short while (normal refunds usually stay pending for days).
  let status = "unknown"
  for (let i = 0; i < 6; i++) {
    const one = await call("GET", `/v1/refunds/${encodeURIComponent(id1)}`)
    status = String(one.json?.status)
    if (status === "processed" || status === "failed") break
    await wait(5_000)
  }
  rec("P6", "INFO", "Refund status over ~30 seconds (pending is normal for a normal-speed refund)", `status=${status}; speed_requested=${String(first.json?.speed_requested)}, speed_processed=${String(first.json?.speed_processed)}`)

  // P7: more than was captured is refused and creates nothing.
  const tooMuch = await call("POST", base, { amount: captured + 100, speed: "normal" }, `probe_${randomUUID()}`)
  rec("P7", tooMuch.status === 400 ? "PASS" : "FAIL", "A refund larger than the payment is refused with 400", show(tooMuch))

  // P8: is a REFUSED attempt remembered under its key? Send the same refused body twice, then the valid body with that key.
  const K2 = `probe_${randomUUID()}`
  const bad1 = await call("POST", base, { amount: captured + 100, speed: "normal" }, K2)
  const bad2 = await call("POST", base, { amount: captured + 100, speed: "normal" }, K2)
  const good = await call("POST", base, { amount: 100, speed: "normal" }, K2)
  rec("P8", "INFO", "A key used on a refused request: the same refusal again, then a valid body", `refused: ${show(bad1)} | again: ${show(bad2)} | valid body on that key: ${show(good)}  <- if this is 409 the refusal was cached under the key and a corrected retry needs a NEW key`)

  // P9: concurrent identical requests make one refund (409 "in progress" is the documented answer for the others).
  const K3 = `probe_${randomUUID()}`
  const before = ((await call("GET", `/v1/payments/${encodeURIComponent(opts.paymentId)}/refunds?count=100`)).json?.items as unknown[] | undefined)?.length ?? 0
  const burst = await Promise.all([1, 2, 3].map(() => call("POST", base, { amount: 100, speed: "normal" }, K3)))
  const after = ((await call("GET", `/v1/payments/${encodeURIComponent(opts.paymentId)}/refunds?count=100`)).json?.items as unknown[] | undefined)?.length ?? 0
  rec("P9", after - before === 1 ? "PASS" : "FAIL", "Three simultaneous identical requests create exactly one refund", `statuses ${burst.map((b) => b.status).join(",")}; refunds before ${before}, after ${after}`)
  return results
}

async function main() {
  const args = process.argv.slice(2)
  const at = args.indexOf("--payment")
  const paymentId = at >= 0 ? (args[at + 1] ?? "") : ""
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
    console.error("usage: pnpm razorpay:probe -- --payment pay_xxxxxxxx [--i-understand-this-sends-test-mode-refunds]")
    process.exit(2)
  }
  const results = await probe({ env: process.env, paymentId, send: args.includes("--i-understand-this-sends-test-mode-refunds") })
  for (const r of results) console.log(`${r.outcome.padEnd(4)}  ${r.id.padEnd(3)} ${r.what}\n          -> ${r.observed}`)
  const failed = results.filter((r) => r.outcome === "FAIL").length
  console.log(`\n${results.length} checks, ${failed} FAILED. Nothing was sent to a live account; every refund above is a test-mode refund.`)
  process.exit(failed ? 1 : 0)
}
if (process.argv[1]?.endsWith("razorpay-refund-probe.ts")) main().catch((e) => (console.error("probe failed:", e instanceof Error ? e.message : "unknown"), process.exit(1)))
