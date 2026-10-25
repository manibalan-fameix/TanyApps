import { ProductLogo } from "@/components/logo"
import { cn } from "@/lib/utils"
import { copy } from "@/lib/copy"
import type { IndustryKey } from "@/lib/verticals"

export function PoweredBy({ product = "motors", className }: { product?: IndustryKey; className?: string }) {
  return (
    <footer className={cn("border-t border-border py-4 text-center text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1.5">
        {copy.tenant.poweredBy} <ProductLogo product={product} className="h-4" />
      </span>
    </footer>
  )
}
