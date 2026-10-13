"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { setMenuItemAvailable } from "@/app/(admin)/(shell)/menu/actions"
import { Button } from "@/components/ui/button"

export function AvailabilityToggle({ id, available }: { id: string; available: boolean }) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setMenuItemAvailable(id, !available)
          if (!res.ok) toast.error(res.error)
        })
      }
    >
      {available ? "Mark sold out" : "Mark available"}
    </Button>
  )
}
