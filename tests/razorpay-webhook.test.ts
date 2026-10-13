import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"

import { verifyWebhookSignature } from "../lib/billing/razorpay"

describe("razorpay webhook signature", () => {
  const secret = "whsec_test"
  const body = JSON.stringify({ event: "subscription.charged", payload: {} })
  const good = createHmac("sha256", secret).update(body).digest("hex")

  it("accepts the signature Razorpay would send", async () => {
    expect(await verifyWebhookSignature(body, good, secret)).toBe(true)
  })
  it("rejects a tampered body, a wrong secret and a wrong length", async () => {
    expect(await verifyWebhookSignature(body + " ", good, secret)).toBe(false)
    expect(await verifyWebhookSignature(body, good, "other")).toBe(false)
    expect(await verifyWebhookSignature(body, "abc", secret)).toBe(false)
  })
})
