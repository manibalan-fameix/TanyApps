"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Logout01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { toast } from "@/lib/toast"

/** Signs this browser out (or every device) and returns to the home page. */
export function SignOutButton({ everywhere = false, label }: { everywhere?: boolean; label?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    const res = await fetch("/api/t/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ everywhere }),
    }).catch(() => null)
    if (!res?.ok) {
      setBusy(false)
      toast.error("Could not sign out. Try again.")
      return
    }
    router.replace("/")
    router.refresh()
  }

  return (
    <Button variant="outline" size="lg" disabled={busy} onClick={signOut}>
      <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} data-icon="inline-start" />
      {label ?? "Sign out"}
    </Button>
  )
}
