"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/** A round back arrow: one step back in the browser history, or the store home when the page was opened directly. */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none", className)}
    >
      <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} className="size-6" />
    </button>
  )
}
