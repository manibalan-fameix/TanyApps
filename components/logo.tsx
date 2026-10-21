import type { IndustryKey } from "@/lib/industries"
import { INDUSTRY_PRODUCT, PRODUCTS, type ProductKey } from "@/lib/products"
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

/** Per-product wordmark (TanyMotos, TanyEats, ...). Swaps to a light-text file in dark mode. */
export function ProductLogo({
  product,
  className,
}: {
  product: ProductKey | IndustryKey
  className?: string
}) {
  const key = product in INDUSTRY_PRODUCT ? INDUSTRY_PRODUCT[product as IndustryKey] : (product as ProductKey)
  const name = PRODUCTS.find((p) => p.key === key)?.name ?? "Tany"
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/${key}-wordmark.svg`}
        alt={name}
        className={cn("h-8 w-auto", className, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/${key}-wordmark-dark.svg`}
        alt={name}
        className={cn("h-8 w-auto", className, "hidden dark:inline-block")}
      />
    </>
  )
}
