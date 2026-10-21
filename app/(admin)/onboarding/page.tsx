import { redirect } from "next/navigation"

import { getFirebaseWebConfig } from "@/lib/auth/firebase"
import { getDealerContext } from "@/lib/auth/context"
import { getUserContact } from "@/lib/tenant/user-phone"

import { EnabledIndustriesProvider } from "@/components/onboarding/enabled-industries"
import { LIVE_INDUSTRY_KEYS, industriesFor } from "@/lib/verticals"

import { OnboardingWizard } from "./onboarding-wizard"

export const metadata = { title: "Set up your showroom" }
export const dynamic = "force-dynamic"

// Shown to dealers as the suffix of their web address, regardless of the local ROOT_DOMAIN.
const PUBLIC_DOMAIN = "tany.in"

// First sign-in: a new user has no dealership yet. Creating one makes them its owner.
export default async function OnboardingPage() {
  const ctx = await getDealerContext()
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
  // A flagged vertical (cabs) is offered only to people on its allow-list, matched on their email.
  const enabledIndustries = industriesFor(row.email ?? ctx.user.email, LIVE_INDUSTRY_KEYS)
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
      />
      </EnabledIndustriesProvider>
    </main>
  )
}
