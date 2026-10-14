// Tany Score: a transparent 0-100 rating computed from the details a dealer has added.
// Pure and client-safe. A missing detail earns no points and is flagged "unknown", never "bad".
import type { MarketplaceDetails } from "./marketplace.ts"

export type CheckStatus = "good" | "ok" | "concern" | "unknown"
export type CategoryKey = "condition" | "usage" | "paperwork" | "assurance" | "listing"

export type ScoreCheck = {
  key: string
  label: string
  points: number
  max: number
  status: CheckStatus
  detail: string
}

export type ScoreCategory = {
  key: CategoryKey
  label: string
  points: number
  max: number
  checks: ScoreCheck[]
}

export type ScoreBand = "excellent" | "good" | "fair" | "caution"

export type TanyScore = {
  score: number
  band: ScoreBand
  verdict: string
  /** Share of checks that had data behind them, 0-100. Low coverage means a preliminary score. */
  coverage: number
  /** Set when a serious disclosed problem limits the score regardless of the rest. */
  capNote: string | null
  categories: ScoreCategory[]
  strengths: ScoreCheck[]
  watchouts: ScoreCheck[]
}

export type ScoreInput = {
  year: number | null
  kmDriven: number | null
  ownerCount: number | null
  askingPrice: number | null
  insuranceValidTill: string | null
  hypothecationCleared: boolean | null
  rcVerified: boolean
  photoCount: number
  details: MarketplaceDetails
  /** Injectable for tests. */
  now?: Date
}

const conditionPoints: Record<string, number> = {
  Excellent: 1,
  Good: 0.75,
  Average: 0.4,
  "Needs replacement": 0,
}

const status = (ratio: number): CheckStatus => (ratio >= 0.75 ? "good" : ratio >= 0.4 ? "ok" : "concern")

function check(key: string, label: string, max: number, ratio: number | null, detail: string): ScoreCheck {
  if (ratio === null) return { key, label, points: 0, max, status: "unknown", detail: "Not provided by the dealer" }
  const clamped = Math.min(1, Math.max(0, ratio))
  return { key, label, points: Math.round(max * clamped * 10) / 10, max, status: status(clamped), detail }
}

const listPresent = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)

export function computeTanyScore(input: ScoreInput): TanyScore {
  const { details } = input
  const now = input.now ?? new Date()
  const trust = details.trust
  const featureCount = Object.values(details.features).reduce((n, items) => n + items.length, 0)

  // Condition and history: 30
  const inspection = trust.inspectionScore
  const accident = listPresent(trust.accidentHistory)
  const accidentRatio: Record<string, number> = {
    "No accident history": 1,
    "Minor repairs": 0.5,
    "Major repair disclosed": 0.15,
    "Not known": 0,
  }
  const service = listPresent(trust.serviceHistory)
  const serviceRatio: Record<string, number> = {
    "Full service history": 1,
    "Dealer maintained": 0.75,
    "Partial service history": 0.6,
    "Not available": 0,
  }
  const tyre = listPresent(details.condition.tyreCondition)
  const battery = listPresent(details.condition.batteryCondition)
  const condition: ScoreCheck[] = [
    check("inspection", "Inspection", 10, inspection ? inspection / 300 : null, `${inspection} of 300 points`),
    check("accident", "Accident history", 6, accident ? (accidentRatio[accident] ?? 0.5) : null, accident ?? ""),
    // Flood damage is only trusted as "not affected" once the dealer has filled in the inspection section.
    trust.floodAffected
      ? check("flood", "Flood damage", 3, 0, "Flood affected")
      : inspection || accident || service
        ? check("flood", "Flood damage", 3, 1, "Not flood affected")
        : check("flood", "Flood damage", 3, null, ""),
    check("service", "Service history", 5, service ? (serviceRatio[service] ?? 0.5) : null, service ?? ""),
    check("tyres", "Tyres", 3, tyre ? (conditionPoints[tyre] ?? 0.5) : null, tyre ?? ""),
    check("battery", "Battery", 3, battery ? (conditionPoints[battery] ?? 0.5) : null, battery ?? ""),
  ]

  // Usage and age: 25
  const age = input.year ? Math.max(1, now.getFullYear() - input.year) : null
  const kmPerYear = input.kmDriven != null && age ? input.kmDriven / age : null
  const kmRatio = kmPerYear === null ? null : kmPerYear <= 8_000 ? 1 : kmPerYear <= 12_000 ? 0.8 : kmPerYear <= 16_000 ? 0.6 : kmPerYear <= 22_000 ? 0.33 : 0.13
  const ownerRatio = input.ownerCount == null ? null : input.ownerCount <= 1 ? 1 : input.ownerCount === 2 ? 0.7 : input.ownerCount === 3 ? 0.4 : 0.2
  const usage: ScoreCheck[] = [
    check("km", "Kilometres driven", 15, kmRatio, kmPerYear === null ? "" : `About ${Math.round(kmPerYear / 100) * 100} km per year`),
    check("owners", "Ownership", 10, ownerRatio, input.ownerCount === 1 ? "Single owner" : `${input.ownerCount} owners so far`),
  ]

  // Paperwork: 20
  const insuranceType = listPresent(details.overview.insuranceType)
  const insuranceValid = input.insuranceValidTill ? new Date(input.insuranceValidTill) >= now : null
  let insuranceRatio: number | null = null
  let insuranceDetail = ""
  if (insuranceType === "Expired" || insuranceValid === false) {
    insuranceRatio = 0
    insuranceDetail = "Insurance has expired"
  } else if (insuranceValid || insuranceType) {
    const strong = insuranceType === "Comprehensive" || insuranceType === "Zero Dep"
    insuranceRatio = (insuranceValid ? 4 / 6 : 0) + (strong ? 2 / 6 : insuranceType === "Third Party" ? 1 / 6 : 0)
    insuranceDetail = [insuranceType, insuranceValid ? `valid till ${input.insuranceValidTill}` : null].filter(Boolean).join(", ")
  }
  const paperwork: ScoreCheck[] = [
    check("rc", "RC verified", 8, input.rcVerified ? 1 : null, "Registration certificate verified"),
    check("insurance", "Insurance", 6, insuranceRatio, insuranceDetail),
    check(
      "loan",
      "Loan / hypothecation",
      6,
      input.hypothecationCleared === null ? null : input.hypothecationCleared ? 1 : 0,
      input.hypothecationCleared ? "No loan pending on the car" : "A loan is still active on the car",
    ),
  ]

  // Assurance: 15
  const plans = details.protectionPlans.length
  const assurance: ScoreCheck[] = [
    check("warranty", "Warranty", 7, trust.warrantyAvailable ? 1 : null, "Warranty available"),
    check("plans", "Protection plans", 5, plans ? plans / 5 : null, `${plans} plan${plans === 1 ? "" : "s"} included`),
    check(
      "token",
      "Refundable booking",
      3,
      details.pricing.bookingAmount ? (details.pricing.tokenRefundable ? 1 : 0.3) : null,
      details.pricing.tokenRefundable ? "Booking amount is refundable" : "Booking amount is non-refundable",
    ),
  ]

  // Listing transparency: 10
  const listing: ScoreCheck[] = [
    check("photos", "Photos", 4, input.photoCount ? input.photoCount / 8 : null, `${input.photoCount} photo${input.photoCount === 1 ? "" : "s"}`),
    check("features", "Features listed", 3, featureCount ? featureCount / 15 : null, `${featureCount} features`),
    check("location", "Location and RTO", 3, details.overview.location || details.overview.rto ? (details.overview.location ? 2 : 0) / 3 + (details.overview.rto ? 1 / 3 : 0) : null, [details.overview.location, details.overview.rto].filter(Boolean).join(", ")),
  ]

  const groups: [CategoryKey, string, ScoreCheck[]][] = [
    ["condition", "Condition and history", condition],
    ["usage", "Usage and age", usage],
    ["paperwork", "Paperwork", paperwork],
    ["assurance", "Assurance", assurance],
    ["listing", "Listing details", listing],
  ]
  const categories: ScoreCategory[] = groups.map(([key, label, checks]) => ({
    key,
    label,
    checks,
    points: Math.round(checks.reduce((n, c) => n + c.points, 0) * 10) / 10,
    max: checks.reduce((n, c) => n + c.max, 0),
  }))
  const all = categories.flatMap((c) => c.checks)

  let score = Math.round(all.reduce((n, c) => n + c.points, 0))
  // A serious disclosed problem must not be hidden behind a pile of positives.
  let capNote: string | null = null
  if (trust.floodAffected) {
    score = Math.min(score, 55)
    capNote = "Flood damage caps the score at 55."
  } else if (accident === "Major repair disclosed") {
    score = Math.min(score, 70)
    capNote = "A disclosed major repair caps the score at 70."
  }

  const band: ScoreBand = score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 55 ? "fair" : "caution"
  const verdict = {
    excellent: "Strong buy. Well documented, low risk.",
    good: "A solid choice. Review the flagged points before deciding.",
    fair: "Decent, but check the flagged points and negotiate.",
    caution: "Proceed carefully. Get an independent inspection first.",
  }[band]

  const answered = all.filter((c) => c.status !== "unknown").length
  return {
    score,
    band,
    verdict,
    coverage: Math.round((answered / all.length) * 100),
    capNote,
    categories,
    strengths: all.filter((c) => c.status === "good").sort((a, b) => b.max - a.max).slice(0, 5),
    watchouts: all
      .filter((c) => c.status === "concern" || c.status === "unknown")
      .sort((a, b) => b.max - a.max)
      .slice(0, 6),
  }
}
