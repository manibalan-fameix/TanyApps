import Link from "next/link"
import { redirect } from "next/navigation"
import { AddCircleIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { DealerMark } from "@/components/dealer-mark"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { selectBusiness } from "@/lib/auth/actions"
import { addableProducts } from "@/lib/auth/businesses"
import { getDealerContext } from "@/lib/auth/context"
import { productForIndustry } from "@/lib/products"
import type { IndustryKey } from "@/lib/verticals"

export const metadata = { title: "Choose a product" }
export const dynamic = "force-dynamic"

// The last step of signing in: one login can run several Tany products, so ask which one to open.
export default async function ChooseProductPage() {
  const ctx = await getDealerContext()
  if (ctx.status === "anonymous") redirect("/login")
  if (ctx.status === "no-dealer") redirect("/onboarding")
  const businesses = ctx.businesses ?? []
  // Nothing to choose between.
  if (businesses.length < 2) redirect("/dashboard")
  const addable = addableProducts(businesses, ctx.user.email)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Logo className="h-9 self-center" />
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Which product do you want to open?</CardTitle>
            <CardDescription>Your account runs more than one Tany product. You can switch any time from the menu at the top left.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {businesses.map((b) => (
              <form key={b.id} action={selectBusiness.bind(null, b.id)}>
                <Button type="submit" variant="outline" className="h-auto w-full justify-start gap-3 p-3 text-left">
                  <DealerMark name={b.name} logoUrl={b.logoUrl} className="size-10" />
                  <span className="grid flex-1 leading-tight">
                    <span className="truncate text-base font-medium">{b.name}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">{productForIndustry(b.industry as IndustryKey).name}</span>
                  </span>
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
                </Button>
              </form>
            ))}
            {addable.map((industry) => (
              <Button key={industry} variant="ghost" className="justify-start gap-3 text-muted-foreground" render={<Link href={`/onboarding?industry=${industry}`} />}>
                <HugeiconsIcon icon={AddCircleIcon} strokeWidth={2} className="size-4" />
                Add {productForIndustry(industry).name}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
