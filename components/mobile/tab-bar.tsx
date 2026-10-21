import Link from "next/link"
import type { ReactNode } from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/** Bottom tab bar shared by the admin and buyer surfaces. Phones only: tablets and up keep their sidebar/header. */
export function MobileTabBar({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[var(--safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
        {children}
      </ul>
    </nav>
  )
}

const tabClass =
  "flex h-full w-full touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition-colors active:scale-95 active:bg-muted"

function TabBody({
  icon,
  label,
  active,
}: {
  icon: IconSvgElement
  label: string
  active?: boolean
}) {
  return (
    <>
      <HugeiconsIcon
        icon={icon}
        strokeWidth={active ? 2.5 : 2}
        className="size-6"
      />
      <span>{label}</span>
    </>
  )
}

export function MobileTab({
  href,
  icon,
  label,
  active,
  prominent,
}: {
  href: string
  icon: IconSvgElement
  label: string
  active?: boolean
  prominent?: boolean
}) {
  if (prominent) {
    return (
      <li className="flex flex-1 items-center justify-center">
        <Link
          href={href}
          aria-label={label}
          className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-90"
        >
          <HugeiconsIcon icon={icon} strokeWidth={2.5} className="size-6" />
        </Link>
      </li>
    )
  }
  return (
    <li className="flex flex-1 py-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          tabClass,
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <TabBody icon={icon} label={label} active={active} />
      </Link>
    </li>
  )
}

export function MobileTabButton({
  icon,
  label,
  active,
  ...props
}: {
  icon: IconSvgElement
  label: string
  active?: boolean
} & React.ComponentProps<"button">) {
  return (
    <li className="flex flex-1 py-1">
      <button
        type="button"
        className={cn(
          tabClass,
          active ? "text-primary" : "text-muted-foreground"
        )}
        {...props}
      >
        <TabBody icon={icon} label={label} active={active} />
      </button>
    </li>
  )
}
