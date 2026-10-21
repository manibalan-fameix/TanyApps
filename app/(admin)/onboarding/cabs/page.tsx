import { redirect } from "next/navigation"

/** Dedicated Cabs signup entry: skip the cross-product picker and start with cab-service details. */
export default function CabsOnboardingEntry() {
  redirect("/onboarding?industry=cabs")
}
