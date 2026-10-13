import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"

import {
  buildCarSystemPrompt,
  buildGeneralSystemPrompt,
  getChatClient,
  getChatModel,
  sanitizeHistory,
  type CarChatContext,
  type InventoryCarSummary,
} from "@/lib/ai/chat"
import { emptyMarketplaceDetails, marketplaceDetailsSchema } from "@/lib/cars/marketplace"
import { titleOf } from "@/lib/cars/title"
import { cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { deviceOf, isBot } from "@/lib/analytics/events"
import { recordEvent } from "@/lib/analytics/track"
import { allow } from "@/lib/rate-limit"
import { TENANT_HEADER } from "@/lib/tenant/host"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { getAllVariants, getVariantById } from "@/lib/variants/repo"

const PER_IP_LIMIT = 20
const PER_DEALER_LIMIT = 300
const WINDOW_MS = 10 * 60_000
const MAX_INVENTORY_CARS = 40

const requestSchema = z.object({
  carSlug: z.string().trim().max(200).optional(),
  messages: z.unknown(),
})

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
}

async function loadCarContext(dealerId: string, carSlug: string): Promise<CarChatContext | null> {
  const db = scopedDb(dealerId)
  const [car] = await db.cars.select(eq(cars.slug, carSlug), { limit: 1 })
  // Same visibility rule as the buyer page: drafts and archived cars are never chattable.
  if (!car || car.status === "draft" || car.status === "archived") return null

  const variant = car.variantId ? await getVariantById(car.variantId) : null
  const details = marketplaceDetailsSchema.catch(emptyMarketplaceDetails()).parse(car.marketplaceDetails ?? {})
  const features = Object.values(details.features).flat()

  return {
    title: titleOf(car.year, variant) || (car.regPrefix?.toUpperCase() ?? "this car"),
    price: car.askingPrice,
    year: car.year,
    kmDriven: car.kmDriven,
    fuel: car.fuel,
    transmission: car.transmission,
    ownerCount: car.ownerCount,
    colour: car.colour,
    insuranceValidTill: car.insuranceValidTill,
    overview: Object.fromEntries(Object.entries(details.overview).filter((e): e is [string, string] => Boolean(e[1]))),
    specs: {
      ...(variant?.engineCc ? { "Engine": `${variant.engineCc} cc` } : {}),
      ...details.specs,
    },
    features,
    reasonsToBuy: details.trust.reasonsToBuy,
    inspectionScore: details.trust.inspectionScore ?? null,
    inspectionSummary: details.trust.inspectionSummary ?? null,
    warrantyAvailable: details.trust.warrantyAvailable,
    serviceHistory: details.trust.serviceHistory ?? null,
    accidentHistory: details.trust.accidentHistory ?? null,
    floodAffected: details.trust.floodAffected,
    conditionNotes: [details.condition.dentNotes, details.condition.exteriorNotes, details.condition.tyreCondition && `Tyres: ${details.condition.tyreCondition}`, details.condition.batteryCondition && `Battery: ${details.condition.batteryCondition}`, ...details.condition.panelIssues.map((p) => `${p.panel}: ${p.issue}`)].filter((v): v is string => Boolean(v)),
    protectionPlans: details.protectionPlans,
    pricing: {
      emiPerMonth: details.pricing.emiStart ?? null,
      downPayment: details.pricing.downPayment ?? null,
      loanDurationMonths: details.pricing.loanDurationMonths ?? null,
      interestRate: details.pricing.interestRate ?? null,
      bookingAmount: details.pricing.bookingAmount ?? null,
    },
  }
}

async function loadInventory(dealerId: string): Promise<InventoryCarSummary[]> {
  const db = scopedDb(dealerId)
  const [live, variants] = await Promise.all([
    db.cars.select(eq(cars.status, "live"), { limit: MAX_INVENTORY_CARS }),
    getAllVariants(),
  ])
  const variantById = new Map(variants.map((v) => [v.id, v]))
  return live.map((car) => {
    const variant = car.variantId ? (variantById.get(car.variantId) ?? null) : null
    return {
      title: titleOf(car.year, variant) || (car.regPrefix?.toUpperCase() ?? "Car"),
      price: car.askingPrice,
      fuel: car.fuel,
      transmission: car.transmission,
      kmDriven: car.kmDriven,
      ownerCount: car.ownerCount,
    }
  })
}

export async function POST(req: Request) {
  const slug = req.headers.get(TENANT_HEADER)
  if (!slug) return NextResponse.json({ error: "unknown_dealer" }, { status: 400 })

  const dealer = await getDealerBySlug(slug)
  if (!dealer) return NextResponse.json({ error: "unknown_dealer" }, { status: 404 })
  if (dealer.suspended) return NextResponse.json({ error: "chat_unavailable" }, { status: 503 })

  const ip = clientIp(req)
  if (!allow(`chat:ip:${ip}`, PER_IP_LIMIT, WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }
  if (!allow(`chat:dealer:${dealer.id}`, PER_DEALER_LIMIT, WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const client = getChatClient()
  if (!client) return NextResponse.json({ error: "chat_unavailable" }, { status: 503 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const messages = sanitizeHistory(parsed.data.messages)
  if (messages.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 })

  let system: string
  if (parsed.data.carSlug) {
    const car = await loadCarContext(dealer.id, parsed.data.carSlug)
    if (!car) return NextResponse.json({ error: "car_not_found" }, { status: 404 })
    system = buildCarSystemPrompt(dealer.displayName, dealer.phone, car)
    // One count per conversation: the first question about this car.
    if (messages.length === 1 && !isBot(req.headers.get("user-agent"))) {
      await recordEvent({ event: "chat", dealerId: dealer.id, carSlug: parsed.data.carSlug, source: "direct", device: deviceOf(req.headers.get("user-agent")), country: req.headers.get("cf-ipcountry") ?? "" })
    }
  } else {
    const inventory = await loadInventory(dealer.id)
    system = buildGeneralSystemPrompt(dealer.displayName, dealer.phone, inventory)
  }

  const stream = client.stream({
    model: getChatModel(),
    maxTokens: 1024,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  })

  const encoder = new TextEncoder()
  const body2 = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) controller.enqueue(encoder.encode(chunk))
      } catch {
        controller.enqueue(encoder.encode("\n\nSomething went wrong. Please try again."))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(body2, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  })
}
