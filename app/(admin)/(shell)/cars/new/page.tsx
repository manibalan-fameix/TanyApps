import { z } from "zod"

import { AddCarWizard } from "@/components/cars/add-car-wizard"
import type { Step } from "@/components/cars/stepper"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getDealerContext } from "@/lib/auth/context"
import { getShareKit } from "@/lib/cars/publish"
import { getCarState } from "@/lib/cars/state"
import { copy } from "@/lib/copy"

export const metadata = { title: copy.admin.addCar.title }

const STEPS = new Set(["plate", "car", "photos", "marketplace", "price", "voice"])

export default async function NewCarPage({ searchParams }: { searchParams: Promise<{ car?: string; step?: string }> }) {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) {
    return (
      <Alert className="max-w-lg">
        <AlertDescription>{copy.admin.dashboard.noDealerBody}</AlertDescription>
      </Alert>
    )
  }

  const { car: carParam, step } = await searchParams
  // Only the dealer's own cars load; anything else quietly starts a fresh flow.
  const car = carParam && z.string().uuid().safeParse(carParam).success ? await getCarState(ctx.dealer.id, carParam) : null
  const kit = car?.status === "live" ? await getShareKit(ctx.dealer.id, car.id) : null

  return (
    <AddCarWizard
      key={car?.id ?? "new"}
      dealer={{ name: ctx.dealer.displayName, logoUrl: ctx.dealer.logoUrl }}
      initialCar={car}
      voiceAllowed={ctx.plan.voiceEntry}
      initialKit={kit}
      initialStep={step && STEPS.has(step) ? (step as Step) : undefined}
    />
  )
}
