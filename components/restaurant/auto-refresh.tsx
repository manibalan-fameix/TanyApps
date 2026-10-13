"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Re-reads the page's data every so often while it is visible, so live screens stay current without a reload. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, seconds * 1000)
    return () => clearInterval(t)
  }, [router, seconds])
  return null
}
