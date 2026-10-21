import { asc } from "drizzle-orm"
import { Call02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { vehicleClasses } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import type { DealerProfile } from "@/lib/tenant/dealer"
import { whatsappLink } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

/**
 * The public page of a cab operator: who they are, how to reach them, and the vehicles they offer. Trip requests are currently
 * handled by phone or WhatsApp; no prices are shown until the operator configures a public fare flow.
 */
export async function CabsHome({ dealer }: { dealer: DealerProfile }) {
  const db = scopedDb(dealer.id)
  const [classes, settings] = await Promise.all([db.vehicleClasses.select(undefined, { orderBy: [asc(vehicleClasses.sortOrder), asc(vehicleClasses.name)] }), db.cabSettings.select()])
  const offered = classes.filter((c) => c.active)
  const cities = settings[0]?.serviceCities ?? []
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{dealer.displayName}</h1>
        <p className="text-muted-foreground">{cities.length > 0 ? `Cabs and tours in ${cities.join(", ")}.` : `Cabs and tours from ${dealer.city}.`}</p>
        <p className="max-w-prose text-sm">Book your trip by phone or WhatsApp. We&apos;ll confirm the vehicle, fare and pickup details with you.</p>
        {dealer.phone ? (
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${dealer.phone}`} className={cn(buttonVariants({ size: "lg" }))}>
              <HugeiconsIcon icon={Call02Icon} strokeWidth={2} className="size-5" />
              Call {dealer.phone.replace(/^\+91/, "+91 ")}
            </a>
            <a href={whatsappLink(dealer.phone, `Hi ${dealer.displayName}, I would like to book a cab.`)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
              WhatsApp us
            </a>
          </div>
        ) : null}
      </section>

      {offered.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Our vehicles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offered.map((c) => (
              <Card key={c.id}>
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={c.name} className="aspect-video w-full rounded-t-xl object-cover" />
                ) : null}
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <CardDescription>
                    {c.seats} seats · {c.bags} bags · {c.ac ? "AC" : "Non-AC"}
                  </CardDescription>
                </CardHeader>
                {c.description ? <CardContent className="text-sm text-muted-foreground">{c.description}</CardContent> : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
