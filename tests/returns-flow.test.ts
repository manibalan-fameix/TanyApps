import { describe, expect, it } from "vitest"

import { approvedText, paidText, refundStatusText, savedText, sentText, summaryText } from "../lib/returns/flow"

describe("what the assistant says", () => {
  it("shows an estimate and says the shop decides", () => {
    expect(summaryText([{ name: "Apple 1kg", qty: 1 }], "expired", "retail", 2, 169, true)).toBe("Here is your request: Apple 1kg × 1 · Expired or spoiled · 2 photos. Estimated refund ₹169 to the way you paid. The shop decides.")
  })
  it("adds the next opening only when the shop is closed", () => {
    expect(sentText("R-4821", 24, null)).toBe("Sent. Your return number is R-4821. The shop usually replies within 24 hours.")
    expect(savedText("tomorrow 7 am")).toMatch(/opens tomorrow 7 am\.$/)
  })
  it("never says the app sent any money", () => {
    const paid = paidText(94, "razorpay_dashboard", "2026-11-26", "rfnd_1")
    expect(paid).toMatch(/^Paid back by the shop: ₹94/)
    expect(paid).toMatch(/as recorded by the shop/)
    expect(`${paid} ${approvedText(94, null)}`).not.toMatch(/\b(we|tany|app) (have )?(sent|refunded)/i)
  })
  it("answers where the refund is from the record only", () => {
    const base = { amountRequested: 94, amountApproved: null, refundMethod: null, refundPaidOn: null, refundRef: null }
    expect(refundStatusText({ ...base, status: "requested" })).toMatch(/not decided/)
    expect(refundStatusText({ ...base, status: "refund_due", amountApproved: 90 })).toBe("₹90 is approved. The shop has not recorded the payment yet.")
  })
})
