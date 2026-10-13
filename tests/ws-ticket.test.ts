import { describe, expect, it } from "vitest"

import { signTicket, verifyTicket } from "../lib/restaurant/ws-ticket"

const claims = (e: number) => ({ k: "dealer:order", r: "rider" as const, e })
const now = 1_800_000_000_000

describe("live-location WebSocket tickets", () => {
  it("accepts a genuine, unexpired ticket", async () => {
    const t = await signTicket("s3cret", claims(now / 1000 + 60))
    expect(await verifyTicket("s3cret", t, now)).toEqual(claims(now / 1000 + 60))
  })
  it("rejects a wrong secret, an expired ticket and tampering", async () => {
    const t = await signTicket("s3cret", claims(now / 1000 + 60))
    expect(await verifyTicket("other", t, now)).toBeNull()
    expect(await verifyTicket("s3cret", t, now + 120_000)).toBeNull()
    const [payload, sig] = t.split(".")
    const forged = btoa(JSON.stringify({ ...claims(now / 1000 + 60), k: "dealer:other" })).replace(/=+$/, "")
    expect(await verifyTicket("s3cret", `${forged}.${sig}`, now)).toBeNull()
    expect(await verifyTicket("s3cret", `${payload}.x.y`, now)).toBeNull()
  })
  it("rejects empty input and a missing secret", async () => {
    expect(await verifyTicket("s3cret", "", now)).toBeNull()
    expect(await verifyTicket("s3cret", null, now)).toBeNull()
    // A Worker with no secret configured accepts nothing.
    expect(await verifyTicket("", await signTicket("s3cret", claims(now / 1000 + 60)), now)).toBeNull()
  })
})
