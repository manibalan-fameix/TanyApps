import type { VideoListing } from "../ai/video-listing.ts"
import { normalizeReg } from "../reg.ts"
import type { VoiceDraft } from "../voice/draft.ts"
import { validateVoiceValue, VOICE_FIELDS, type VoiceField, type VoiceValues } from "../voice/template.ts"
import { emptyMarketplaceDetails, marketplaceDetailsSchema } from "./marketplace.ts"

/** What the browser sent, keeping only known blanks whose value is exactly the right shape. The words were parsed in the browser; this is checked again here. */
export function cleanVoiceValues(input: unknown): VoiceValues {
  const out: Record<string, unknown> = {}
  if (!input || typeof input !== "object") return out
  for (const f of VOICE_FIELDS) {
    if (!Object.hasOwn(input, f)) continue
    const v = validateVoiceValue(f, (input as Record<string, unknown>)[f])
    if (v !== null) out[f] = v
  }
  return out as VoiceValues
}

const panelEntry = (s: string) => {
  const m = s.match(/^(.+?)\s*(?::|-|\bhas\b|\bhave\b|\bwith\b|\bshows?\b)\s*(.+)$/i)
  return { panel: (m ? m[1] : s).trim().slice(0, 80), issue: (m ? m[2] : "Noted").trim().slice(0, 200) }
}

/** The same shape the video flow produces, so both go through createCarFromVideo. */
export function voiceToListing(v: VoiceValues): VideoListing {
  const s = (f: VoiceField) => (typeof v[f] === "string" ? (v[f] as string) : undefined)
  const n = (f: VoiceField) => (typeof v[f] === "number" ? (v[f] as number) : undefined)
  const b = (f: VoiceField) => (typeof v[f] === "boolean" ? (v[f] as boolean) : undefined)
  const a = (f: VoiceField) => (Array.isArray(v[f]) ? (v[f] as string[]) : [])

  const specs: Record<string, string> = {}
  for (const f of ["engineCc", "bootSpace", "seatingCapacity", "mileage", "groundClearance"] as const) if (s(f)) specs[f] = s(f)!

  const base = emptyMarketplaceDetails()
  const details = marketplaceDetailsSchema.parse({
    overview: { makeYear: s("makeYear"), registrationYear: s("registrationYear"), insuranceType: s("insurance"), rto: s("rto"), location: s("location"), bodyType: s("bodyType") },
    pricing: {
      emiStart: n("emiStart"), loanAmount: n("loanAmount"), downPayment: n("downPayment"), loanDurationMonths: n("loanDurationMonths"),
      interestRate: n("interestRate"), bookingAmount: n("bookingAmount"), tokenRefundable: b("tokenRefundable") ?? base.pricing.tokenRefundable,
      availabilityStatus: s("availability"),
    },
    trust: {
      inspectionScore: n("inspectionScore"), inspectionSummary: s("inspectionSummary"), reasonsToBuy: a("reasonsToBuy"),
      warrantyAvailable: b("warrantyAvailable") ?? false, serviceHistory: s("serviceHistory"), accidentHistory: s("accidentHistory"), floodAffected: b("floodAffected") ?? false,
    },
    condition: { dentNotes: s("dentNotes"), exteriorNotes: s("exteriorNotes"), tyreCondition: s("tyreCondition"), batteryCondition: s("batteryCondition"), panelIssues: a("panelIssues").map(panelEntry) },
    specs,
    features: { safety: a("safety"), comfort: a("comfort"), exterior: a("exterior"), interior: a("interior"), infotainment: a("infotainment") },
    protectionPlans: a("protectionPlans"),
  })

  return {
    make: s("make") ?? null,
    model: s("model") ?? null,
    variant: s("variant") ?? null,
    year: n("year") ?? null,
    fuel: (s("fuel") as VideoListing["fuel"]) ?? null,
    transmission: (s("transmission") as VideoListing["transmission"]) ?? null,
    colour: s("colour") ?? null,
    ownerCount: n("owners") ?? null,
    kmDriven: n("km") ?? null,
    askingPrice: n("price") ?? null,
    plate: s("plate") ? normalizeReg(s("plate")!) : null,
    marketplaceDetails: details,
  }
}


export type ReadVoiceDraft = { values: VoiceValues; lang: VoiceDraft["lang"]; done: boolean }

/** A saved voice session as stored, checked blank by blank. Null when there is none or it is unusable. */
export function readVoiceDraft(raw: unknown): ReadVoiceDraft | null {
  if (!raw || typeof raw !== "object") return null
  const d = raw as Partial<VoiceDraft>
  return {
    values: cleanVoiceValues(d.values),
    lang: d.lang === "ta" || d.lang === "tg" ? d.lang : "en",
    done: d.done === true,
  }
}

/** "Maruti Baleno 2019": what the cars table calls a car that has no exact model yet. */
export function voiceDraftTitle(d: ReadVoiceDraft | null): string | null {
  if (!d) return null
  const v = d.values
  const t = [typeof v.year === "number" ? v.year : null, v.make, v.model].filter((x): x is string | number => x !== null && x !== undefined && x !== "")
  return t.length ? t.join(" ") : null
}
