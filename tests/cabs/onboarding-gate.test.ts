import { beforeEach, describe, expect, it, vi } from "vitest"

// The gate that matters is on the server: hiding the card in the browser is only a courtesy.
const ctx = vi.fn()
const contact = vi.fn()
const phone = vi.fn()
const create = vi.fn()
vi.mock("@/lib/auth/context", () => ({ getDealerContext: () => ctx() }))
vi.mock("@/lib/tenant/user-phone", () => ({ getUserContact: () => contact(), getUserPhone: () => phone(), claimVerifiedPhone: async () => true }))
vi.mock("@/lib/tenant/create-dealer", () => ({ createDealerForOwner: (...a: unknown[]) => create(...a), isSlugTaken: async () => false }))
vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: async () => true }))
vi.mock("@/lib/cloudflare/domains", () => ({ mapDealerSubdomain: async () => ({ ok: true }) }))

import { createDealership } from "../../app/(admin)/onboarding/actions"

const draft = (industry: string, plan = "starter") => ({
  industry,
  displayName: "Anna Travels",
  slug: "anna-travels",
  city: "Chennai",
  phone: "9876543210",
  hours: { mon: { open: "09:00", close: "18:00" } },
  primary: "#1d4ed8",
  accent: "#f59e0b",
  radius: "md",
  plan,
  billingCycle: "monthly",
})

beforeEach(() => {
  for (const m of [ctx, contact, phone, create]) m.mockReset()
  ctx.mockResolvedValue({ status: "no-dealer", user: { id: "u1", email: "stranger@example.com", name: "S" } })
  phone.mockResolvedValue("+919000000000") // a different number: stops the flow right after the gate, before anything is created
  vi.stubEnv("CABS_ALLOWED_EMAILS", "owner@anna.in")
  vi.stubEnv("NODE_ENV", "production")
})

describe("creating a business: the cabs allow-list", () => {
  it("refuses a cab business for someone who is not on the list, before anything is created", async () => {
    contact.mockResolvedValue({ phone: null, email: "stranger@example.com" })
    const r = await createDealership(draft("cabs"))
    expect(r).toEqual({ ok: false, fieldErrors: { industry: "This product is not available to your account yet." } })
    expect(create).not.toHaveBeenCalled()
  })

  it("refuses it when the person has no email at all", async () => {
    ctx.mockResolvedValue({ status: "no-dealer", user: { id: "u1", email: null, name: "S" } })
    contact.mockResolvedValue({ phone: "+919876543210", email: null })
    expect(await createDealership(draft("cabs"))).toMatchObject({ ok: false, fieldErrors: { industry: expect.any(String) } })
  })

  it("lets a listed person past the gate (the next check, their verified phone, is then what stops this test)", async () => {
    contact.mockResolvedValue({ phone: null, email: "owner@anna.in" })
    const r = await createDealership(draft("cabs"))
    expect(r).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } })
    expect((r as { fieldErrors: Record<string, string> }).fieldErrors.industry).toBeUndefined()
  })

  it("does not apply to restaurants or motors", async () => {
    contact.mockResolvedValue({ phone: null, email: "stranger@example.com" })
    for (const industry of ["restaurants", "motors"]) {
      const r = await createDealership(draft(industry, "free"))
      expect((r as { fieldErrors?: Record<string, string> }).fieldErrors?.industry).toBeUndefined()
    }
  })

  it("never lets a cab business start on the free plan, even from a listed person", async () => {
    contact.mockResolvedValue({ phone: null, email: "owner@anna.in" })
    expect(await createDealership(draft("cabs", "free"))).toMatchObject({ ok: false, fieldErrors: { plan: expect.any(String) } })
    expect(create).not.toHaveBeenCalled()
  })
})
