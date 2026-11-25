import { redirect } from "next/navigation"

/** Dedicated Retail signup entry: skip the cross-product picker and start by choosing the kind of shop. */
export default function RetailOnboardingEntry() {
  redirect("/onboarding?industry=retail")
}
