import { Logo } from "@/components/logo"
import { copy } from "@/lib/copy"

export function PoweredBy() {
  return (
    <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {copy.tenant.poweredBy} <Logo className="h-4 text-foreground" />
      </span>
    </footer>
  )
}
