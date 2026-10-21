import { z } from "zod"

import type { BusinessHours, DayKey } from "../hours"
import { LIVE_INDUSTRY_KEYS } from "../verticals"
import { BILLING_CYCLES, SIGNUP_PLAN_KEYS, TRIAL_DAYS, isFreePlan } from "../plans"
import { isValidSlug } from "../tenant/host"
import { RADIUS_OPTIONS, type RadiusKey, dealerThemeSchema, readableOn } from "../theme/tokens"

export const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
]

/** Curated brand colours. Each primary reads well with the white or dark text `readableOn` picks. */
export const PALETTES = [
  { name: "Royal blue", primary: "#1d4ed8", accent: "#f59e0b" },
  { name: "Forest", primary: "#15803d", accent: "#f59e0b" },
  { name: "Crimson", primary: "#b91c1c", accent: "#0f172a" },
  { name: "Violet", primary: "#7e22ce", accent: "#14b8a6" },
  { name: "Teal", primary: "#0f766e", accent: "#f97316" },
  { name: "Burnt orange", primary: "#c2410c", accent: "#1d4ed8" },
  { name: "Slate", primary: "#334155", accent: "#f59e0b" },
  { name: "Magenta", primary: "#be185d", accent: "#0ea5e9" },
] as const

export const HOURS_PRESETS: { label: string; days: DayKey[]; open: string; close: string }[] = [
  { label: "Mon to Sat, 10 am to 7 pm", days: ["mon", "tue", "wed", "thu", "fri", "sat"], open: "10:00", close: "19:00" },
  { label: "Every day, 9 am to 8 pm", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], open: "09:00", close: "20:00" },
  { label: "Mon to Fri, 9:30 am to 6 pm", days: ["mon", "tue", "wed", "thu", "fri"], open: "09:30", close: "18:00" },
]

export const RADIUS_KEYS = Object.keys(RADIUS_OPTIONS) as [RadiusKey, ...RadiusKey[]]

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30.")
const dayHours = z
  .object({ open: time, close: time })
  .refine((d) => d.open < d.close, "Closing time must be after opening time.")
export const hoursSchema = z
  .partialRecord(z.enum(DAYS.map((d) => d.key) as [DayKey, ...DayKey[]]), dayHours)
  .refine((h) => Object.keys(h).length > 0, "Pick at least one day you are open.")
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid colour.")

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Use at least 2 characters.")
  .refine(isValidSlug, "Use letters, numbers and hyphens only. This name is not available.")

export const onboardSchema = z.object({
  industry: z.enum(LIVE_INDUSTRY_KEYS).default("motors"),
  displayName: z.string().trim().min(2, "Enter your business name.").max(80),
  slug: slugSchema,
  city: z.string().trim().min(2, "Enter your city.").max(60),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(\+91|91|0)?[6-9][0-9]{9}$/, "Enter a valid 10-digit mobile number."))
    .transform((v) => `+91${v.slice(-10)}`),
  hours: hoursSchema,
  primary: hex,
  accent: hex,
  radius: z.enum(RADIUS_KEYS),
  plan: z.enum(SIGNUP_PLAN_KEYS),
  billingCycle: z.enum(BILLING_CYCLES),
})

export type OnboardInput = z.infer<typeof onboardSchema>
export type OnboardDraft = z.input<typeof onboardSchema>

/** Dealer row values derived from validated input. The text colour is computed, never trusted from the client. */
export function toDealerValues(input: OnboardInput, logoUrl?: string) {
  const theme = dealerThemeSchema.parse({
    primary: input.primary,
    primaryForeground: readableOn(input.primary),
    accent: input.accent,
    radius: input.radius,
  })
  return {
    slug: input.slug,
    industry: input.industry,
    displayName: input.displayName,
    city: input.city,
    phone: input.phone,
    businessHours: input.hours as BusinessHours,
    theme,
    logoUrl: logoUrl ?? null,
    plan: input.plan,
    billingCycle: input.billingCycle,
    // The free plan has no trial and no end date.
    trialEndsAt: isFreePlan(input.plan) ? null : new Date(Date.now() + TRIAL_DAYS * 86_400_000),
  }
}
