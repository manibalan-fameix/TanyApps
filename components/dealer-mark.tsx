import { cn } from "@/lib/utils"

/** The dealer's own logo, or a round badge with their first initial when they have not uploaded one. */
export function DealerMark({
  name,
  logoUrl,
  className,
}: {
  name: string
  logoUrl: string | null
  className?: string
}) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={name}
      className={cn(
        "size-8 shrink-0 rounded-lg bg-muted object-contain",
        className
      )}
    />
  ) : (
    <span
      aria-label={name}
      role="img"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground",
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
