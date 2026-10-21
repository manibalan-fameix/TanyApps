import { describe, expect, it } from "vitest"

import { calendarDays, inWindow, istDateString, istDayNumber, istMinuteOfDay, parseClock } from "../../lib/cabs/time"
import { ist } from "./fare-helpers"

describe("IST helpers", () => {
  it("reads the clock in India whatever the server's time zone", () => {
    // 20:00 UTC on 1 Nov is 01:30 on 2 Nov in IST.
    const t = new Date("2026-11-01T20:00:00Z")
    expect(istDateString(t)).toBe("2026-11-02")
    expect(istMinuteOfDay(t)).toBe(90)
    expect(istDayNumber(new Date("2026-11-02T00:00:00+05:30"))).toBe(istDayNumber(new Date("2026-11-02T23:59:59+05:30")))
    expect(istDayNumber(new Date("2026-11-03T00:00:00+05:30"))).toBe(istDayNumber(new Date("2026-11-02T23:59:59+05:30")) + 1)
  })

  it("counts calendar days inclusively, never below one", () => {
    expect(calendarDays(ist("2026-11-02T10:00:00"), ist("2026-11-02T20:00:00"))).toBe(1)
    expect(calendarDays(ist("2026-11-02T22:00:00"), ist("2026-11-03T06:00:00"))).toBe(2)
    expect(calendarDays(ist("2026-11-02T05:00:00"), ist("2026-11-04T23:00:00"))).toBe(3)
    expect(calendarDays(ist("2026-11-05T10:00:00"), ist("2026-11-02T10:00:00"))).toBe(1)
  })

  it("parses clock times strictly", () => {
    expect(parseClock("00:00")).toBe(0)
    expect(parseClock("22:30")).toBe(1350)
    expect(parseClock("23:59")).toBe(1439)
    for (const bad of ["24:00", "9:00", "12:60", "noon", "", null, undefined]) expect(parseClock(bad as string)).toBeNull()
  })

  it("handles a window that wraps midnight and one that does not", () => {
    const night = [parseClock("22:00")!, parseClock("06:00")!] as const
    expect(inWindow(parseClock("22:00")!, ...night)).toBe(true)
    expect(inWindow(parseClock("23:59")!, ...night)).toBe(true)
    expect(inWindow(parseClock("00:00")!, ...night)).toBe(true)
    expect(inWindow(parseClock("05:59")!, ...night)).toBe(true)
    expect(inWindow(parseClock("06:00")!, ...night)).toBe(false) // the end is out
    expect(inWindow(parseClock("12:00")!, ...night)).toBe(false)
    expect(inWindow(parseClock("13:00")!, 12 * 60, 14 * 60)).toBe(true)
    expect(inWindow(parseClock("15:00")!, 12 * 60, 14 * 60)).toBe(false)
    expect(inWindow(600, 600, 600)).toBe(false) // an empty window
  })
})
