import { existsSync, readdirSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string; when: number }[] }
const files = readdirSync("drizzle").filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()

describe("migration files, journal and snapshots agree", () => {
  it("the journal lists every migration file exactly once, in order, with no gaps", () => {
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i))
    expect(journal.entries.map((e) => `${e.tag}.sql`)).toEqual(files)
    expect(new Set(journal.entries.map((e) => e.tag)).size).toBe(journal.entries.length)
  })
  it("each migration has a snapshot, and times only move forward", () => {
    for (const e of journal.entries) expect(existsSync(`drizzle/meta/${String(e.idx).padStart(4, "0")}_snapshot.json`), e.tag).toBe(true)
    const whens = journal.entries.map((e) => e.when)
    expect(whens).toEqual([...whens].sort((a, b) => a - b))
  })
  it("the release migrations 0029 onward are the ones this release expects, in this order", () => {
    expect(journal.entries.slice(29).map((e) => e.tag.replace(/^\d{4}_/, "").replace(/_[a-z]+_[a-z]+$/, "")).length).toBeGreaterThanOrEqual(4)
    expect(files.slice(30)).toEqual(["0030_booking_single_paid_and_refund_state.sql", "0031_trips_hold_alert_index.sql", "0032_eats_refund_state_and_payment_exceptions.sql"])
  })
})

describe("the release migrations (0030-0032) are additive: nothing is dropped, rewritten, renamed or deleted", () => {
  const statements = (f: string) =>
    readFileSync(`drizzle/${f}`, "utf8")
      .replace(/--[^\n>]*\n/g, "\n") // SQL comments (not the drizzle breakpoint markers)
      .split("--> statement-breakpoint")
      .map((x) => x.trim())
      .filter(Boolean)
  for (const f of files.slice(30)) {
    it(`${f}`, () => {
      for (const st of statements(f)) {
        expect(st, st).not.toMatch(/\bDROP\b|\bRENAME\b|\bTRUNCATE\b|\bDELETE\b|\bUPDATE\b\s+"?\w+"?\s+SET|ALTER COLUMN|SET NOT NULL|\bTYPE\b\s+\w+\s*USING/i)
        // A column added NOT NULL must have a default, or existing rows would make the statement fail or rewrite the table.
        if (/ADD COLUMN/i.test(st) && /NOT NULL/i.test(st)) expect(st, st).toMatch(/DEFAULT/i)
      }
    })
  }
  it("0030's unique index first checks for existing duplicate paid bookings and refuses with a message instead of failing obscurely", () => {
    const sql = readFileSync("drizzle/0030_booking_single_paid_and_refund_state.sql", "utf8")
    expect(sql.indexOf("RAISE EXCEPTION")).toBeGreaterThan(-1)
    expect(sql.indexOf("RAISE EXCEPTION")).toBeLessThan(sql.indexOf('CREATE UNIQUE INDEX "bookings_one_paid_per_car_uq"'))
  })
})
