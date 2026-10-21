"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Re-reads the page every so often while a booking is waiting on someone, so the answer appears without a reload. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
