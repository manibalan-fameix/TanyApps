import { notFound } from "next/navigation"

import { LoginForm } from "@/components/login-form"
import { getDealerBySlug } from "@/lib/tenant/dealer"

export const metadata = { title: "My account" }

export default async function AccountPage({
  params,
}: {
  params: Promise<{ dealer: string }>
}) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer) notFound()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background p-6 max-md:pb-[calc(6rem+var(--safe-area-inset-bottom))] md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm name={dealer.displayName} />
      </div>
    </div>
  )
}
