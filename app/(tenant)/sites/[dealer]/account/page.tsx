import { notFound, redirect } from "next/navigation"

import { LoginForm } from "@/components/login-form"
import { currentCustomer } from "@/lib/core/login/customer"
import { LOGIN_INDUSTRIES } from "@/lib/core/login/host"
import { getDealerBySlug } from "@/lib/tenant/dealer"

export const metadata = { title: "My account" }
export const dynamic = "force-dynamic"

export default async function AccountPage({
  params,
}: {
  params: Promise<{ dealer: string }>
}) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer) notFound()

  // Shops whose customers sign in with a phone OTP: go straight to the real sign-in (or to the profile when already signed in).
  if ((LOGIN_INDUSTRIES as readonly string[]).includes(dealer.industry)) {
    if (await currentCustomer(dealer.id)) redirect("/profile")
    redirect(`/api/t/auth/start?next=${encodeURIComponent("/profile")}`)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-6 max-md:pb-[calc(6rem+var(--safe-area-inset-bottom))] md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm name={dealer.displayName} />
      </div>
    </div>
  )
}
