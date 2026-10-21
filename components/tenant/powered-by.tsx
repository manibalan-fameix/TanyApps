import { ProductLogo } from "@/components/logo"
import { copy } from "@/lib/copy"
import type { IndustryKey } from "@/lib/verticals"

export function PoweredBy({ product = "motors" }: { product?: IndustryKey }) {
  return (
    <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {copy.tenant.poweredBy} <ProductLogo product={product} className="h-4" />
      </span>
    </footer>
  )
}
