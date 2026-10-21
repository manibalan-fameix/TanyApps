import { redirect } from "next/navigation"

import { getFirebaseWebConfig } from "@/lib/auth/firebase"
import { getDealerContext } from "@/lib/auth/context"
import { getOtherProductForUser, getUserContact } from "@/lib/tenant/user-phone"

import { EnabledIndustriesProvider } from "@/components/onboarding/enabled-industries"
import { isIndustryKey, LIVE_INDUSTRY_KEYS, industriesFor, type IndustryKey } from "@/lib/verticals"

import { OnboardingWizard } from "./onboarding-wizard"

export const metadata = { title: "Set up your showroom" }
export const dynamic = "force-dynamic"

// Shown to dealers as the suffix of their web address, regardless of the local ROOT_DOMAIN.
const PUBLIC_DOMAIN = "tany.in"

// First sign-in: a new user has no dealership yet. Creating one makes them its owner.
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ industry?: string }> }) {
  const requested = (await searchParams).industry
  const requestedIndustry: IndustryKey | undefined = isIndustryKey(requested) ? requested : undefined
  const ctx = await getDealerContext(requestedIndustry)
  if (ctx.status === "anonymous") redirect("/login")
  if (ctx.status === "ok") redirect("/dashboard")

  const testPhones =
    process.env.NODE_ENV === "development"
      ? (process.env.FIREBASE_TEST_PHONES ?? "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      : []
  const firstName = ctx.user.name?.trim().split(/\s+/)[0] ?? ""
  // A phone number on the user row came from an OTP sign-in, so it is already verified.
  const row = await getUserContact(ctx.user.id)
  const digits = row.phone?.replace(/\D/g, "") ?? ""
  const verifiedPhone = digits.length >= 10 ? digits.slice(-10) : ""
  // Only verticals with an active rollout flag are filtered here.
  const enabledIndustries = industriesFor(row.email ?? ctx.user.email, LIVE_INDUSTRY_KEYS)
  const initialIndustry: IndustryKey | undefined = requestedIndustry
  const productNotice = initialIndustry ? await getOtherProductForUser(ctx.user.id, initialIndustry) : null
  return (
    <main>
      <EnabledIndustriesProvider value={enabledIndustries}>
      <OnboardingWizard
        rootDomain={PUBLIC_DOMAIN}
        firstName={firstName}
        email={row.email ?? ctx.user.email ?? ""}
        verifiedPhone={verifiedPhone}
        firebaseConfig={getFirebaseWebConfig()}
        testPhones={testPhones}
        initialIndustry={initialIndustry}
        phoneNotice={productNotice ? `This number is already associated with ${productNotice}. You can continue setting up your Tany${initialIndustry === "cabs" ? "Cabs" : initialIndustry === "motors" ? "Motos" : "Eats"} account.` : undefined}
      />
      </EnabledIndustriesProvider>
    </main>
  )
}
