import { z } from "zod"

import { normalizePhone } from "../crypto/blind-index"
import { isValidReg, normalizeReg } from "../reg"
import { parseClock } from "./time"
import { findState } from "./states"
import { percentToBps, rupeesToPaise } from "./money"

// Everything an operator can type, validated on the server (the forms only help). Money arrives as rupees text and leaves as
// whole paise; see ./money.ts.

const TRIP_TYPES = ["airport", "outstation_one_way", "outstation_round", "local_hourly", "package_tour"] as const
export const TRIP_TYPE_LABEL: Record<(typeof TRIP_TYPES)[number], string> = {
  airport: "Airport transfer",
  outstation_one_way: "Outstation one-way",
  outstation_round: "Outstation round trip",
  local_hourly: "Local hourly package",
  package_tour: "Package tour",
}

const text = (min: number, max: number, what: string) => z.string().trim().min(min, `Enter ${what}.`).max(max, `${what[0].toUpperCase()}${what.slice(1)} is too long.`)
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional().transform((v) => v ?? null)
/** JavaScript quietly turns 2026-02-30 into 2 March; a real date comes back unchanged when written out again. */
const isRealDate = (s: string) => {
  const t = Date.parse(`${s}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31.").refine(isRealDate, "That date does not exist.")
const optionalDate = z.union([dateOnly, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null))
const int = (min: number, max: number, what: string) => z.number({ error: `Enter ${what}.` }).int(`${what[0].toUpperCase()}${what.slice(1)} must be a whole number.`).min(min, `${what[0].toUpperCase()}${what.slice(1)} is too low.`).max(max, `${what[0].toUpperCase()}${what.slice(1)} is too high.`)

/** An amount typed in rupees ("14.50"), required, becoming paise. */
const rupeesRequired = (what: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const p = rupeesToPaise(v)
    if (p === null) ctx.addIssue({ code: "custom", message: `Enter ${what} in rupees, like 14.50.` })
    return p ?? 0
  })
/** An amount typed in rupees, blank meaning "not set". */
const rupeesOptional = (what: string) =>
  z.union([z.string(), z.number(), z.null()]).optional().transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null
    const p = rupeesToPaise(v)
    if (p === null) ctx.addIssue({ code: "custom", message: `Enter ${what} in rupees, like 14.50.` })
    return p
  })

// ---------- fleet ----------

export const vehicleClassSchema = z.object({
  name: text(2, 40, "a class name"),
  seats: int(1, 60, "the number of seats"),
  bags: int(0, 60, "the number of bags"),
  ac: z.boolean(),
  description: z.string().trim().max(300).default(""),
  imageUrl: z.string().trim().max(500).default(""),
  sortOrder: int(0, 1000, "the order").default(0),
  active: z.boolean().default(true),
})
export type VehicleClassInput = z.infer<typeof vehicleClassSchema>

const thisYear = () => new Date().getFullYear()
export const vehicleSchema = z.object({
  classId: z.string().uuid("Choose a vehicle class."),
  reg: z.string().trim().min(1, "Enter the registration number.").refine(isValidReg, "Enter a valid registration number, like TN 09 AB 1234.").transform(normalizeReg),
  makeModel: text(2, 60, "the make and model"),
  year: z.union([int(1990, thisYear() + 1, "the year"), z.null()]).optional().transform((v) => v ?? null),
  colour: optionalText(30),
  fuel: z.enum(["petrol", "diesel", "cng", "electric", "hybrid"]).nullable().optional().transform((v) => v ?? null),
  ownership: z.enum(["own", "attached"]),
  odometerKm: int(0, 3_000_000, "the odometer reading"),
  status: z.enum(["active", "maintenance", "inactive"]).default("active"),
})
export type VehicleInput = z.infer<typeof vehicleSchema>

export const VEHICLE_DOC_TYPES = ["rc", "insurance", "permit", "fc", "puc", "tax"] as const
export const VEHICLE_DOC_LABEL: Record<(typeof VEHICLE_DOC_TYPES)[number], string> = { rc: "RC", insurance: "Insurance", permit: "Permit", fc: "Fitness certificate", puc: "Pollution (PUC)", tax: "Road tax" }
export const DRIVER_DOC_TYPES = ["licence", "badge", "id_proof", "police_verification", "medical"] as const
export const DRIVER_DOC_LABEL: Record<(typeof DRIVER_DOC_TYPES)[number], string> = { licence: "Driving licence", badge: "Badge", id_proof: "ID proof", police_verification: "Police verification", medical: "Medical certificate" }

const docBase = {
  number: optionalText(60),
  validTill: optionalDate,
  fileKey: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
}
export const vehicleDocumentSchema = z
  .object({ type: z.enum(VEHICLE_DOC_TYPES), validFrom: optionalDate, ...docBase })
  .refine((d) => !d.validFrom || !d.validTill || d.validTill >= d.validFrom, { path: ["validTill"], message: "The expiry date must be after the start date." })
export const driverDocumentSchema = z.object({ type: z.enum(DRIVER_DOC_TYPES), ...docBase })

export const blockedPeriodSchema = z
  .object({
    resourceType: z.enum(["vehicle", "driver"]),
    resourceId: z.string().uuid(),
    startsAt: z.coerce.date({ error: "Enter when it starts." }),
    endsAt: z.coerce.date({ error: "Enter when it ends." }),
    reason: z.string().trim().max(200).default(""),
  })
  .refine((b) => b.endsAt > b.startsAt, { path: ["endsAt"], message: "It must end after it starts." })

const mobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizePhone(v)
    if (!p) ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number." })
    return p ?? ""
  })
export const driverSchema = z.object({
  name: text(2, 80, "the driver's name"),
  phone: mobile,
  licenceNo: z.string().trim().max(30).transform((v) => v.toUpperCase().replace(/[\s-]/g, "")).nullable().optional().transform((v) => v || null),
  licenceValidTill: optionalDate,
  badgeNo: optionalText(30),
  employment: z.enum(["employee", "attached", "freelance"]),
  languages: z.array(z.string().trim().min(2).max(30)).max(8).default([]),
  status: z.enum(["available", "on_trip", "off", "inactive"]).default("available"),
})
export type DriverInput = z.infer<typeof driverSchema>

// ---------- pricing ----------

const optPaise = (what: string) => rupeesOptional(what)

const rateCardBase = {
  vehicleClassId: z.string().uuid("Choose a vehicle class."),
  validFrom: optionalDate,
  validTo: optionalDate,
  active: z.boolean().default(true),
}

/**
 * One rate card per trip type, each asking for exactly what the fare engine needs for that type (lib/cabs/fare.ts). A field the
 * type does not use is dropped, so a card never carries leftovers that look like they matter.
 */
export const rateCardSchema = z
  .discriminatedUnion("tripType", [
    z.object({ tripType: z.literal("airport"), ...rateCardBase, basePaise: optPaise("the base fare"), perKmPaise: rupeesRequired("the rate per km") }),
    z.object({ tripType: z.literal("outstation_one_way"), ...rateCardBase, perKmPaise: rupeesRequired("the rate per km"), minKmPerDay: int(1, 2000, "the minimum km per day"), bataPerDayPaise: optPaise("the driver allowance") }),
    z.object({ tripType: z.literal("outstation_round"), ...rateCardBase, perKmPaise: rupeesRequired("the rate per km"), minKmPerDay: int(1, 2000, "the minimum km per day"), bataPerDayPaise: optPaise("the driver allowance") }),
    z.object({
      tripType: z.literal("local_hourly"),
      ...rateCardBase,
      basePaise: rupeesRequired("the package price"),
      packageHours: int(1, 24, "the package hours"),
      packageKm: int(1, 1000, "the package km"),
      extraKmPaise: optPaise("the extra km rate"),
      extraHourPaise: optPaise("the extra hour rate"),
    }),
  ])
  .refine((d) => !d.validFrom || !d.validTo || d.validTo >= d.validFrom, { path: ["validTo"], message: "Valid-to must be after valid-from." })
export type RateCardInput = z.infer<typeof rateCardSchema>

const scope = z
  .object({
    states: z.array(z.string().trim()).max(40).default([]),
    places: z.array(z.string().trim().min(2).max(60)).max(40).default([]),
    window: z.object({ start: z.string(), end: z.string() }).nullable().optional(),
    vehicleClassIds: z.array(z.string().uuid()).max(40).default([]),
    tripTypes: z.array(z.enum(TRIP_TYPES)).max(5).default([]),
    dateRanges: z.array(z.object({ from: dateOnly, to: dateOnly })).max(20).default([]),
  })
  .superRefine((s, ctx) => {
    if (s.window && (parseClock(s.window.start) === null || parseClock(s.window.end) === null)) ctx.addIssue({ code: "custom", path: ["window"], message: "Use times like 22:00." })
    for (const code of s.states) if (!findState(code)) ctx.addIssue({ code: "custom", path: ["states"], message: `"${code}" is not a state code.` })
    for (const r of s.dateRanges) if (r.to < r.from) ctx.addIssue({ code: "custom", path: ["dateRanges"], message: "A date range must end after it starts." })
  })
  .transform((s) => ({
    ...(s.states.length ? { states: s.states.map((c) => findState(c)!.code) } : {}),
    ...(s.places.length ? { places: s.places } : {}),
    ...(s.window ? { window: s.window } : {}),
    ...(s.vehicleClassIds.length ? { vehicleClassIds: s.vehicleClassIds } : {}),
    ...(s.tripTypes.length ? { tripTypes: s.tripTypes } : {}),
    ...(s.dateRanges.length ? { dateRanges: s.dateRanges } : {}),
  }))

export const surchargeSchema = z
  .object({
    kind: z.enum(["night", "hill", "permit", "airport", "festival"]),
    label: text(2, 60, "a name for this charge"),
    scope,
    mode: z.enum(["flat", "percent"]),
    amount: z.union([z.string(), z.number()]),
    active: z.boolean().default(true),
  })
  .transform((d, ctx) => {
    if (d.mode === "flat") {
      const p = rupeesToPaise(d.amount)
      if (p === null) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the amount in rupees, like 150." })
      return { kind: d.kind, label: d.label, scope: d.scope, active: d.active, amountPaise: p ?? 0, bps: null as number | null }
    }
    const bps = percentToBps(d.amount)
    if (bps === null) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter a percentage, like 5 or 2.5." })
    return { kind: d.kind, label: d.label, scope: d.scope, active: d.active, amountPaise: null as number | null, bps: bps ?? 0 }
  })
export type SurchargeInput = z.infer<typeof surchargeSchema>

export const packageSchema = z.object({
  name: text(2, 80, "the package name"),
  description: z.string().trim().max(1000).default(""),
  days: int(1, 60, "the number of days"),
  itinerary: z.array(z.object({ day: int(1, 60, "the day"), title: text(1, 80, "a title"), description: z.string().trim().max(500).default("") })).max(60).default([]),
  /** { classId: rupees } as typed; converted to paise by the action. */
  prices: z.record(z.string().uuid(), z.union([z.string(), z.number()])).default({}),
  imageUrls: z.array(z.string().trim().max(500)).max(10).default([]),
  active: z.boolean().default(true),
})

// ---------- settings ----------

export const cabSettingsSchema = z.object({
  advancePercent: z.union([z.string(), z.number(), z.null()]).optional(),
  cancellationPolicy: z.array(z.object({ hoursBefore: int(0, 720, "the hours"), feePercent: z.union([z.string(), z.number()]) })).max(8).default([]),
  nightStart: z.string().trim().default(""),
  nightEnd: z.string().trim().default(""),
  gstPercent: z.union([z.string(), z.number(), z.null()]).optional(),
  sacCode: z.string().trim().max(10).default(""),
  gstin: z.string().trim().toUpperCase().max(15).default(""),
  stateCode: z.string().trim().default(""),
  invoicePrefix: z.string().trim().toUpperCase().max(10).default(""),
  minLeadMinutes: int(0, 10_080, "the minimum notice").default(0),
  bufferMinutes: int(0, 720, "the buffer").default(0),
  serviceCities: z.array(z.string().trim().min(2).max(60)).max(60).default([]),
})

export type CabSettingsRow = {
  advanceBps: number | null
  cancellationPolicy: { hoursBefore: number; feeBps: number }[]
  nightStart: string | null
  nightEnd: string | null
  gstRateBps: number | null
  sacCode: string | null
  gstin: string | null
  stateCode: string | null
  invoicePrefix: string | null
  minLeadMinutes: number
  bufferMinutes: number
  serviceCities: string[]
}

const GSTIN = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** Turns what the settings form sent into the row to save, or says what is wrong with each field. Nothing is defaulted. */
export function toSettingsRow(raw: unknown): { ok: true; row: CabSettingsRow } | { ok: false; errors: Record<string, string> } {
  const parsed = cabSettingsSchema.safeParse(raw)
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message
    return { ok: false, errors }
  }
  const v = parsed.data
  const errors: Record<string, string> = {}
  const blank = (x: unknown) => x === null || x === undefined || String(x).trim() === ""

  let advanceBps: number | null = null
  if (!blank(v.advancePercent)) {
    advanceBps = percentToBps(v.advancePercent)
    if (advanceBps === null) errors.advancePercent = "Enter a percentage from 0 to 100."
  }
  let gstRateBps: number | null = null
  if (!blank(v.gstPercent)) {
    gstRateBps = percentToBps(v.gstPercent)
    if (gstRateBps === null) errors.gstPercent = "Enter a percentage from 0 to 100, like 5. Use 0 if you do not charge GST."
  }

  const start = v.nightStart === "" ? null : parseClock(v.nightStart)
  const end = v.nightEnd === "" ? null : parseClock(v.nightEnd)
  if ((v.nightStart === "") !== (v.nightEnd === "")) errors.nightEnd = "Set both the start and the end of the night window, or neither."
  else if (v.nightStart !== "" && (start === null || end === null)) errors.nightStart = "Use times like 22:00 and 06:00."

  let stateCode: string | null = null
  if (v.stateCode !== "") {
    const st = findState(v.stateCode)
    if (!st) errors.stateCode = "Choose your state."
    else stateCode = st.gst
  }
  let gstin: string | null = null
  if (v.gstin !== "") {
    const m = GSTIN.exec(v.gstin)
    if (!m) errors.gstin = "A GSTIN has 15 characters, like 33ABCDE1234F1Z5."
    else if (stateCode && m[1] !== stateCode) errors.gstin = "The first two digits of the GSTIN must match your state."
    else gstin = v.gstin
  }
  if (v.sacCode !== "" && !/^\d{4,8}$/.test(v.sacCode)) errors.sacCode = "A SAC code is 4 to 8 digits."

  const tiers: { hoursBefore: number; feeBps: number }[] = []
  for (const t of v.cancellationPolicy) {
    const feeBps = percentToBps(t.feePercent)
    if (feeBps === null) {
      errors.cancellationPolicy = "Enter each cancellation fee as a percentage from 0 to 100."
      break
    }
    tiers.push({ hoursBefore: t.hoursBefore, feeBps })
  }
  if (new Set(tiers.map((t) => t.hoursBefore)).size !== tiers.length) errors.cancellationPolicy ??= "Each cancellation tier needs a different number of hours."
  // Longest notice first: "free until 24 hours before, then 50% until 4 hours before, then 100%".
  tiers.sort((a, b) => b.hoursBefore - a.hoursBefore)

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    row: {
      advanceBps,
      cancellationPolicy: tiers,
      nightStart: start === null ? null : v.nightStart,
      nightEnd: end === null ? null : v.nightEnd,
      gstRateBps,
      sacCode: v.sacCode || null,
      gstin,
      stateCode,
      invoicePrefix: v.invoicePrefix || null,
      minLeadMinutes: v.minLeadMinutes,
      bufferMinutes: v.bufferMinutes,
      serviceCities: [...new Set(v.serviceCities)],
    },
  }
}
