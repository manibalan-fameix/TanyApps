import { afterEach, describe, expect, it, vi } from "vitest"

import { countMetric } from "../lib/core/metrics"
import { recordUsage } from "../lib/core/usage"

const DEALER = "11111111-1111-4111-8111-111111111111"

describe("usage attribution", () => {
  afterEach(() => vi.restoreAllMocks())

  it("logs one structured line naming the unit and the business, and nothing personal", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    recordUsage("llm_chat_request", DEALER)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({ metric: "usage", count: 1, unit: "llm_chat_request", dealer: DEALER })
  })

  it("carries a quantity, and countMetric still defaults to one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    recordUsage("rc_lookup_request", DEALER, 3)
    countMetric("something")
    expect(JSON.parse(warn.mock.calls[0][0] as string).count).toBe(3)
    expect(JSON.parse(warn.mock.calls[1][0] as string).count).toBe(1)
  })
})
