import { cn } from "@/lib/utils"

/** Tany logo: app icon plus wordmark. Served at 1x from /public/brand. */
export function Logo({
  className,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "alt">) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/tany-logo.png"
      alt="Tany"
      width={916}
      height={320}
      className={cn("h-8 w-auto", className)}
      {...props}
    />
  )
}

/** Square Tany app icon. */
export function LogoIcon({
  className,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "alt">) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/tany-icon.png"
      alt="Tany"
      width={320}
      height={320}
      className={cn("size-8", className)}
      {...props}
    />
  )
}
