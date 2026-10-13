import { z } from "zod"

export const PINCODE_RE = /^[1-9]\d{5}$/

/** "600001, 600002 600003" becomes ["600001","600002","600003"], dropping duplicates. Anything that is not a pincode is reported. */
export function parsePincodes(text: string): { pincodes: string[]; invalid: string[] } {
  const seen = new Set<string>()
  const invalid: string[] = []
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    if (PINCODE_RE.test(raw)) seen.add(raw)
    else invalid.push(raw)
  }
  return { pincodes: [...seen], invalid }
}

export const zoneSchema = z.object({
  name: z.string().trim().min(2, "Name the zone, like Anna Nagar.").max(60),
  pincodes: z.array(z.string().regex(PINCODE_RE, "Use 6-digit pincodes.")).min(1, "Add at least one pincode.").max(200),
  fee: z.number().int().min(0).max(5000),
  minOrder: z.number().int().min(0).max(1_000_000).nullable().default(null),
  etaMinutes: z.number().int().min(5).max(600).nullable().default(null),
})
export type ZoneInput = z.infer<typeof zoneSchema>

export type ZoneRow = { id: string; name: string; pincodes: string[]; fee: number; minOrder: number | null; etaMinutes: number | null; isActive: boolean }

/** The active zone serving a pincode. If two zones list it, the earliest one wins. */
export function findZone<T extends Pick<ZoneRow, "pincodes" | "isActive">>(zones: T[], pincode: string): T | null {
  return zones.find((z) => z.isActive && z.pincodes.includes(pincode)) ?? null
}

// ---------- partners ----------

export const partnerSchema = z.object({
  name: z.string().trim().min(2, "Enter the rider's name.").max(60),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(\+91|91|0)?[6-9][0-9]{9}$/, "Enter a valid 10-digit mobile number."))
    .transform((v) => `+91${v.slice(-10)}`),
  vehicleNumber: z.string().trim().max(20).default(""),
})
export const pinSchema = z.string().regex(/^\d{4,6}$/, "The PIN must be 4 to 6 digits.")

/** The next rider code: DP001, DP002... never reusing a code that exists. */
export function nextPartnerCode(existing: string[]): string {
  const used = new Set(existing)
  for (let n = 1; ; n++) {
    const code = `DP${String(n).padStart(3, "0")}`
    if (!used.has(code)) return code
  }
}
