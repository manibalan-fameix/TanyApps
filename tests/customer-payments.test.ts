import { afterEach, describe, expect, it, vi } from "vitest"

import { customerPaymentsEnabled } from "@/lib/core/payments/customer-payments"

describe("customer online payments switch", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("stays on unless turned off, so a release never stops payments by itself", () => {
    vi.stubEnv("CUSTOMER_ONLINE_PAYMENTS", undefined)
    expect(customerPaymentsEnabled()).toBe(true)
  })

  it("is off only for exactly 0", () => {
    vi.stubEnv("CUSTOMER_ONLINE_PAYMENTS", "0")
    expect(customerPaymentsEnabled()).toBe(false)
  })
})
