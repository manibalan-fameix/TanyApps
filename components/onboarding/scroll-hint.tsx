import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"

/**
 * A faint "Scroll Products" hint with a bouncing arrow, shown in the explore reel's empty card in the
 * slot where the product name appears. Render it inside the fixed "tany" core (a `relative` flex row).
 */
export function ScrollHint() {
  return (
    <span className="absolute top-1/2 left-full ml-3 flex translate-y-[calc(-50%+0.35rem)] items-center gap-1.5 text-2xl leading-none sm:text-3xl font-semibold whitespace-nowrap text-muted-foreground/20 scroll-hint-nudge">
      Scroll Products
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        className="size-6"
      />
    </span>
  )
}
