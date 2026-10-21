import { describe, expect, it } from "vitest"

import { quote, type QuoteInput } from "../../lib/cabs/fare"
import data from "./fare-cases.json"

type CaseInput = Omit<QuoteInput, "startAt" | "returnAt" | "endAt"> & { startAt: string; returnAt?: string; endAt?: string }
type Case = {
  id: string
  placeholder: boolean
  description: string
  input: CaseInput
  expect: {
    totalPaise: number
    taxablePaise: number
    gst: { cgstPaise: number; sgstPaise: number; igstPaise: number }
    advanceDuePaise: number | null
    days: number
    lines: { key: string; paise: number }[]
  }
}

const cases = data.cases as unknown as Case[]

function toInput(c: CaseInput): QuoteInput {
  return { ...c, startAt: new Date(c.startAt), returnAt: c.returnAt ? new Date(c.returnAt) : undefined, endAt: c.endAt ? new Date(c.endAt) : undefined }
}

describe("hand-priced fare cases (tests/cabs/fare-cases.json)", () => {
  it("has the 15 cases, each marked as a placeholder until the pilot operator's numbers replace them", () => {
    expect(cases).toHaveLength(15)
    expect(cases.every((c) => c.placeholder === true)).toBe(true)
    expect(new Set(cases.map((c) => c.id)).size).toBe(15)
  })

  it("covers the trip types and charges the plan asks for", () => {
    const ids = cases.map((c) => c.id).join(" ")
    for (const word of ["airport-sedan", "airport-suv", "pondicherry-one-way", "madurai-round", "kodaikanal-hill", "tirupati-ap-permit", "local-4h-40km", "local-8h-80km", "night"]) expect(ids).toContain(word)
  })

  for (const c of cases) {
    it(`${c.id}: ${c.description}`, () => {
      const r = quote(toInput(c.input))
      expect(r.ok, JSON.stringify(r)).toBe(true)
      if (!r.ok) return
      expect(r.totalPaise).toBe(c.expect.totalPaise)
      expect(r.totalPaise % 100).toBe(0) // a whole number of rupees
      expect(r.taxablePaise).toBe(c.expect.taxablePaise)
      expect({ cgstPaise: r.gst.cgstPaise, sgstPaise: r.gst.sgstPaise, igstPaise: r.gst.igstPaise }).toEqual(c.expect.gst)
      expect(r.advanceDuePaise).toBe(c.expect.advanceDuePaise)
      expect(r.meta.days).toBe(c.expect.days)
      // Every line, in order, to the paise.
      expect(r.lines.filter((l) => l.included).map((l) => ({ key: l.key, paise: l.paise }))).toEqual(c.expect.lines)
      // The lines the customer sees always add up to the total.
      expect(r.lines.filter((l) => l.included).reduce((a, l) => a + l.paise, 0)).toBe(r.totalPaise)
    })
  }
})
