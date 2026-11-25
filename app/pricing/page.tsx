import { PricingSection } from "@/components/site/pricing-section"
import { SiteShell } from "@/components/site/site-shell"

export const metadata = { title: "Pricing | TanyApps" }

export default function Page() {
  return (
    <SiteShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-muted-foreground">Software subscription plans, priced in Indian rupees. Choose your type of business.</p>
        </div>
        <PricingSection />
      </div>
    </SiteShell>
  )
}
