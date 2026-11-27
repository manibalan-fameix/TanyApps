import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { DomainPanel, type DomainView } from "@/components/settings/domain-panel"
import { SettingsPage } from "@/components/settings/settings-page"
import { buttonVariants } from "@/components/ui/button"
import { getDealerContext } from "@/lib/auth/context"
import { effectivePlanKey } from "@/lib/billing/state"
import { cnameTarget, customDomainsConfigured } from "@/lib/cloudflare/custom-hostnames"
import { company } from "@/lib/company"
import { cnameValue, domainStage, splitHostname, verificationRecordName, verificationRecordValue } from "@/lib/domains/hostname"
import { publicRootDomain } from "@/lib/env"
import { offersCustomDomain } from "@/lib/domains/rollout"
import { getPlan } from "@/lib/plans"
import { getDomain } from "@/lib/tenant/domains"
import { isOrderIndustry } from "@/lib/verticals"

export const metadata = { title: "Custom domain" }
export const dynamic = "force-dynamic"

export default async function DomainSettingsPage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")
  const { dealer } = ctx
  if (!offersCustomDomain(dealer.industry)) notFound()
  const included = getPlan(effectivePlanKey(dealer)).customDomain
  const configured = customDomainsConfigured()
  const row = ctx.dealerInDb ? await getDomain(dealer.id) : null
  const parts = row ? splitHostname(row.hostname) : null
  const token = row?.verificationToken
  const domain: DomainView | null =
    row && parts
      ? {
          hostname: row.hostname,
          stage: domainStage(row),
          lastChecked: row.lastCheckedAt?.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) ?? null,
          guide: {
            host: row.hostname,
            domain: parts.domain,
            name: parts.name,
            value: token ? cnameValue(token, cnameTarget()) : "",
            // Only www stands in for the bare domain: shop.myshop.com leaves myshop.com free for something else.
            forward: parts.name === "www",
          },
          backup: token ? { name: verificationRecordName(parts.name), value: verificationRecordValue(token) } : null,
        }
      : null

  const note = !ctx.dealerInDb
    ? "Not available in the local demo account."
    : ctx.role !== "owner"
      ? "Only the owner can change this."
      : !configured
        ? "Custom domains are not switched on yet."
        : undefined

  // What customers lose when the address changes depends on what this kind of site keeps in the browser.
  const switchWarning = isOrderIndustry(dealer.industry)
    ? "Customers who were signed in need to sign in again, and anything in their cart will not carry over."
    : dealer.industry === "cabs"
      ? "Customers who were signed in need to sign in again."
      : undefined

  return (
    <SettingsPage title="Custom domain" description="Show your shop on a domain you own, such as www.yourshop.com." note={note}>
      <div className="grid gap-6">
        {included ? null : (
          <div className="grid justify-items-start gap-3">
            <p className="text-sm">
              {domain ? "Your plan no longer includes a custom domain, so visitors use your Tany address." : "A custom domain is part of the Pro plan."}
            </p>
            <Link href="/settings/billing" className={buttonVariants()}>
              See plans
            </Link>
          </div>
        )}
        <DomainPanel
          domain={domain}
          defaultAddress={`${dealer.slug}.${publicRootDomain()}`}
          canEdit={ctx.role === "owner" && ctx.dealerInDb}
          canUse={included && configured}
          switchWarning={switchWarning}
          helpPhone={company.phone.replace(/\D/g, "")}
        />
      </div>
    </SettingsPage>
  )
}
