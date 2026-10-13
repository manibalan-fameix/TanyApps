import { z } from "zod"

export const fuelOptions = ["Petrol", "Diesel", "CNG", "LPG", "Electric", "Hybrid"] as const
export const transmissionOptions = ["Manual", "Automatic", "AMT", "CVT", "DCT", "Torque Converter", "iMT"] as const
export const ownerOptions = ["1st Owner", "2nd Owner", "3rd Owner", "4th+ Owner"] as const
export const insuranceTypeOptions = ["Comprehensive", "Third Party", "Zero Dep", "Expired", "Not Available"] as const
export const locationOptions = ["Vadapalani", "Anna Nagar", "T Nagar", "Velachery", "Tambaram", "Porur", "Ambattur", "OMR", "ECR", "Adyar", "Guindy", "Other"] as const
export const availabilityOptions = ["Available", "Upcoming", "Booked", "Sold"] as const
export const tyreConditionOptions = ["Excellent", "Good", "Average", "Needs replacement"] as const
export const batteryConditionOptions = ["Excellent", "Good", "Average", "Needs replacement"] as const
export const serviceHistoryOptions = ["Full service history", "Partial service history", "Dealer maintained", "Not available"] as const
export const accidentHistoryOptions = ["No accident history", "Minor repairs", "Major repair disclosed", "Not known"] as const

export const reasonOptions = [
  "Assured with warranty",
  "Single owner",
  "Low kilometres",
  "Non-accidental",
  "Well maintained",
  "Recently serviced",
  "New tyres",
  "Top variant",
] as const

export const featureOptions = {
  safety: ["Airbags", "ABS", "EBD", "Rear camera", "Parking sensors", "ESP", "Hill hold"],
  comfort: ["Cruise control", "Keyless start", "Automatic AC", "Rear AC vents", "Power windows"],
  exterior: ["Sunroof", "Alloy wheels", "Rain sensing wipers", "LED headlights", "Fog lamps"],
  interior: ["Leather seats", "Height adjustable seat", "Armrest", "Ambient lighting"],
  infotainment: ["Touchscreen", "Android Auto", "Apple CarPlay", "Bluetooth", "USB", "Steering controls"],
} as const

export const protectionPlanOptions = [
  "Comprehensive insurance",
  "Warranty plan",
  "Periodic service",
  "Roadside assistance 24x7",
  "90-day buyback assurance",
  "Maintenance package",
] as const

export const bodyTypeOptions = ["Hatchback", "Sedan", "SUV", "MUV", "Coupe", "Convertible", "Pickup", "Van"] as const

const cleanString = z.string().trim().max(120).optional().nullable()
const optionalInt = z.number().int().min(0).max(100_000_000).optional().nullable()
const optionalSmallNumber = z.number().min(0).max(10_000).optional().nullable()

export const marketplaceDetailsSchema = z.object({
  overview: z.object({
    makeYear: cleanString,
    registrationYear: cleanString,
    insuranceType: cleanString,
    rto: cleanString,
    location: cleanString,
    bodyType: cleanString,
  }).default({}),
  pricing: z.object({
    emiStart: optionalInt,
    loanAmount: optionalInt,
    downPayment: optionalInt,
    loanDurationMonths: z.number().int().min(1).max(120).optional().nullable(),
    interestRate: optionalSmallNumber,
    bookingAmount: optionalInt,
    /** Current ex-showroom price of a new car of the same model, as told by the dealer. Drives the "you save" comparison. */
    newCarPrice: optionalInt,
    tokenRefundable: z.boolean().default(true),
    availabilityStatus: z.string().trim().max(40).optional().nullable(),
  }).default({ tokenRefundable: true }),
  trust: z.object({
    inspectionScore: z.number().int().min(0).max(300).optional().nullable(),
    inspectionSummary: z.string().trim().max(500).optional().nullable(),
    reasonsToBuy: z.array(z.string().trim().max(80)).max(12).default([]),
    warrantyAvailable: z.boolean().default(false),
    serviceHistory: cleanString,
    accidentHistory: cleanString,
    floodAffected: z.boolean().default(false),
  }).default({ reasonsToBuy: [], warrantyAvailable: false, floodAffected: false }),
  condition: z.object({
    dentNotes: z.string().trim().max(500).optional().nullable(),
    exteriorNotes: z.string().trim().max(500).optional().nullable(),
    tyreCondition: cleanString,
    batteryCondition: cleanString,
    panelIssues: z.array(z.object({
      panel: z.string().trim().max(80),
      issue: z.string().trim().max(200),
    })).max(20).default([]),
  }).default({ panelIssues: [] }),
  specs: z.record(z.string(), z.string().trim().max(120)).default({}),
  features: z.object({
    safety: z.array(z.string().trim().max(80)).max(20).default([]),
    comfort: z.array(z.string().trim().max(80)).max(20).default([]),
    exterior: z.array(z.string().trim().max(80)).max(20).default([]),
    interior: z.array(z.string().trim().max(80)).max(20).default([]),
    infotainment: z.array(z.string().trim().max(80)).max(20).default([]),
  }).default({ safety: [], comfort: [], exterior: [], interior: [], infotainment: [] }),
  protectionPlans: z.array(z.string().trim().max(80)).max(12).default([]),
})

export type MarketplaceDetails = z.infer<typeof marketplaceDetailsSchema>

export const emptyMarketplaceDetails = (): MarketplaceDetails => marketplaceDetailsSchema.parse({})
