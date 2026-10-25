"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "@/lib/toast"

import { Button } from "@/components/ui/button"

/** A button that runs a bound server action, then refreshes the page. Failures show as a toast. */
export function ActionButton({
  action,
  children,
  variant = "outline",
  confirm,
  success,
}: {
  action: () => Promise<{ ok: true } | { ok: false; error: string }>
  children: React.ReactNode
  variant?: "default" | "outline" | "ghost" | "destructive"
  confirm?: string
  success?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return
        start(async () => {
          const res = await action()
          if (res.ok) {
            if (success) toast.success(success)
            router.refresh()
          } else toast.error(res.error)
        })
      }}
    >
      {children}
    </Button>
  )
}
