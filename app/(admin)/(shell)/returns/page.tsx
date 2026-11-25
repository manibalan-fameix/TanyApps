import Link from "next/link"

import { PageHeader } from "@/components/restaurant/page-header"
import { ReturnsInbox } from "@/components/returns/inbox"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { readReturnSettings, returnsConfigured } from "@/lib/returns/rules"
import { inbox } from "@/lib/returns/shop"

export const metadata = { title: "Returns" }
export const dynamic = "force-dynamic"

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { dealer, owner } = await requireRestaurant()
  const { id } = await searchParams
  const settings = readReturnSettings(dealer.profile)

  if (!returnsConfigured(dealer.profile))
    return (
      <div className="grid gap-4">
        <PageHeader title="Returns" description="Problems customers report on their orders, as a chat with you." />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Returns are switched off</CardTitle>
            <CardDescription>Switch them on to let signed-in customers report a damaged, wrong or missing item from their order.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings/returns" className={buttonVariants()}>Set up returns</Link>
          </CardContent>
        </Card>
      </div>
    )

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title="Returns" description={settings.enabled ? "Problems customers report on their orders, longest waiting first." : "New return requests are switched off. Open conversations can still be finished."}>
        <Link href="/settings/returns" className={buttonVariants({ variant: "outline" })}>Return settings</Link>
      </PageHeader>
      <ReturnsInbox initialRows={await inbox(dealer.id)} initialId={id ?? null} owner={owner} dealerId={dealer.id} quickReplies={settings.quickReplies} />
    </div>
  )
}
