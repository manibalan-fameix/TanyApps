"use client"

import { useEffect } from "react"

/** Tells us a real person opened this page. Once per browser session per page, so refreshes do not pad the count. */
export function ViewBeacon({ carSlug = "" }: { carSlug?: string }) {
  useEffect(() => {
    const key = `viewed:${carSlug || "store"}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, "1")
    } catch {
      // storage blocked: count it anyway
    }
    const params = new URLSearchParams(window.location.search)
    void fetch("/api/t/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        carSlug,
        utmSource: params.get("utm_source") ?? undefined,
        referrer: document.referrer || undefined,
      }),
      keepalive: true,
    }).catch(() => undefined)
  }, [carSlug])
  return null
}
