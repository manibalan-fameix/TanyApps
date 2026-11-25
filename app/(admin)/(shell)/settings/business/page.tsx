import { redirect } from "next/navigation"

import { BusinessDetailsForm } from "@/components/settings/business-details-form"
import { SettingsPage } from "@/components/settings/settings-page"
import { getDealerContext } from "@/lib/auth/context"
import { getFirebaseWebConfig } from "@/lib/auth/firebase"
import { tenantUrl } from "@/lib/env"
import type { RetailTypeKey } from "@/lib/verticals/retail-types"

export const metadata = { title: "Business details" }
export const dynamic = "force-dynamic"

export default async function BusinessDetailsPage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")
  const { dealer } = ctx
  const locked = ctx.role !== "owner" || !ctx.dealerInDb
  const testPhones = process.env.NODE_ENV === "development" ? (process.env.FIREBASE_TEST_PHONES ?? "").split(",").map((n) => n.trim()).filter(Boolean) : []
  return (
    <SettingsPage
      title="Business details"
      description="The logo, name and contact number you set up when you joined."
      note={locked ? (ctx.dealerInDb ? "Only the owner can change these." : "Not available in the local demo account.") : undefined}
    >
      <BusinessDetailsForm
        key={dealer.id}
        initial={{
          displayName: dealer.displayName,
          city: dealer.city,
          phone: (dealer.phone ?? "").replace(/\D/g, "").slice(-10),
          businessType: dealer.businessType as RetailTypeKey | null,
          logoUrl: dealer.logoUrl,
        }}
        industry={dealer.industry}
        webAddress={tenantUrl(dealer.slug)}
        firebaseConfig={getFirebaseWebConfig()}
        testPhones={testPhones}
        disabled={locked}
      />
    </SettingsPage>
  )
}
