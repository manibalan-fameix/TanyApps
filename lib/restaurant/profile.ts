import { z } from "zod"

/** The words and contact details a restaurant shows on its public pages. All optional. */
export const profileSchema = z.object({
  tagline: z.string().trim().max(80).default(""),
  about: z.string().trim().max(1200).default(""),
  address: z.string().trim().max(200).default(""),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email.")
    .default(""),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^(\+91|91|0)?[6-9][0-9]{9}$/.test(v), "Enter a valid 10-digit WhatsApp number.")
    .transform((v) => (v === "" ? "" : `91${v.slice(-10)}`))
    .default(""),
})
export type RestaurantProfile = z.infer<typeof profileSchema>

export function readProfile(stored: unknown): RestaurantProfile {
  const parsed = profileSchema.safeParse(stored ?? {})
  return parsed.success ? parsed.data : profileSchema.parse({})
}
