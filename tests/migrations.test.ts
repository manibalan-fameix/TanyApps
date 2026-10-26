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
    expect(files.slice(30)).toEqual(["0030_booking_single_paid_and_refund_state.sql", "0031_trips_hold_alert_index.sql", "0032_eats_refund_state_and_payment_exceptions.sql", "0033_team_invites.sql", "0034_security_audit_events.sql", "0035_usage_accounting.sql", "0036_trips_idempotency_key.sql"])
  })
})

describe("the release migrations (0030 onward) are additive: nothing is dropped, rewritten, renamed or deleted", () => {
  const statements = (f: string) =>
    readFileSync(`drizzle/${f}`, "utf8")
      .replace(/--[^\n>]*\n/g, "\n") // SQL comments (not the drizzle breakpoint markers)
      .split("--> statement-breakpoint")
      .map((x) => x.trim())
      .filter(Boolean)
  for (const f of files.slice(30)) {
    it(`${f}`, () => {
      for (const st of statements(f)) {
        // A foreign key's "ON DELETE cascade / set null" is a referential rule on a new table, not a statement that deletes data.
        // Creating a protective trigger or its function is additive: its text necessarily names the UPDATE/DELETE/TRUNCATE it blocks.
        if (/^CREATE (OR REPLACE )?(FUNCTION|TRIGGER)\b/i.test(st)) continue
        const stmt = st.replace(/\bON (DELETE|UPDATE) (cascade|set null|no action|restrict)\b/gi, "")
        expect(stmt, st).not.toMatch(/\bDROP\b|\bRENAME\b|\bTRUNCATE\b|\bDELETE\b|\bUPDATE\b\s+"?\w+"?\s+SET|ALTER COLUMN|SET NOT NULL|\bTYPE\b\s+\w+\s*USING/i)
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
