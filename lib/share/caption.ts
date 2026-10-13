import { z } from "zod"

import type { VisionClient } from "../ai/vision"

export type CaptionFacts = {
  dealerName: string
  city: string
  phone?: string | null
  year: number
  make: string
  model: string
  variant: string
  fuel?: string | null
  transmission?: string | null
  kmDriven: number
  ownerCount?: number | null
  price: number
  /** Only claim RTO verification when the RC came from a real provider. */
  rcVerified: boolean
  link: string
}

const inr = new Intl.NumberFormat("en-IN")
export const formatInr = (n: number) => inr.format(n)

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]} owner`

const hashtag = (s: string) => `#${s.replace(/[^A-Za-z0-9]/g, "")}`

/** Deterministic caption. Always works, and is the fallback whenever AI output fails the checks. */
export function templateCaption(f: CaptionFacts): string {
  const facts = [f.fuel, f.transmission, `${formatInr(f.kmDriven)} km`, f.ownerCount ? ordinal(f.ownerCount) : null].filter(Boolean)
  return [
    `🚗 ${f.year} ${f.make} ${f.model} ${f.variant}`,
    facts.join(" • "),
    `💰 ₹${formatInr(f.price)}`,
    `📍 ${f.dealerName}, ${f.city}`,
    f.rcVerified ? "✅ RC details verified" : null,
    "🔑 Test drive available",
    "",
    `👉 Photos, specs & EMI: ${f.link}`,
    f.phone ? `📞 ${f.phone}` : null,
    "",
    ["#UsedCars", `#${f.city.replace(/\s+/g, "")}`, hashtag(f.make.split(" ")[0]), hashtag(`${f.make.split(" ")[0]}${f.model}`), "#SecondHandCars"].join(" "),
  ]
    .filter((l) => l !== null)
    .join("\n")
}

const answer = z.object({ caption: z.string().min(1).max(2200) })

/**
 * Some models occasionally emit an emoji as a lone UTF-16 surrogate (or the JSON round-trip drops
 * its other half), which then renders as � wherever it lands. Once broken there is no way to
 * recover the intended character, so a caption in that state is rejected outright.
 */
function hasBrokenUnicode(s: string): boolean {
  return s.includes("�") || /[\uD800-\uDFFF]/.test(s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))
}

/**
 * A caption is only accepted from the model if it carries the real link and the exact price,
 * introduces no other URLs, and contains no corrupted characters. Anything else falls back to the template.
 */
export function captionIsFaithful(caption: string, f: CaptionFacts): boolean {
  if (hasBrokenUnicode(caption)) return false
  if (!caption.includes(f.link)) return false
  if (!caption.replace(/[,\s]/g, "").includes(String(f.price))) return false
  const urls = caption.match(/https?:\/\/\S+/g) ?? []
  return urls.every((u) => u.replace(/[).,!?]+$/, "") === f.link)
}

export async function generateCaption(vision: VisionClient | null, f: CaptionFacts): Promise<{ caption: string; source: "ai" | "template" }> {
  const fallback = { caption: templateCaption(f), source: "template" as const }
  if (!vision) return fallback
  const result = await vision.json({
    system:
      "You write Instagram captions for an independent used-car dealer in Chennai. Warm, plain English, a few emojis, " +
      "short lines. Use ONLY the facts provided. Never invent features, offers, discounts or claims. " +
      "Include the link exactly as given, and the price exactly as given.",
    prompt: [
      "Write the caption for this car. Facts:",
      JSON.stringify({ ...f, priceFormatted: `₹${formatInr(f.price)}`, kmFormatted: `${formatInr(f.kmDriven)} km`, phone: f.phone ?? undefined }),
      f.rcVerified ? "The RC details are verified; you may say so." : "Do NOT claim the RC is verified.",
      "End with 4-6 relevant hashtags.",
    ].join("\n"),
    jsonSchema: {
      type: "object",
      properties: { caption: { type: "string" } },
      required: ["caption"],
      additionalProperties: false,
    },
    validate: answer,
    maxTokens: 800,
  })
  if (result && captionIsFaithful(result.caption, f) && (f.rcVerified || !/verified/i.test(result.caption))) {
    return { caption: result.caption.trim(), source: "ai" }
  }
  return fallback
}
