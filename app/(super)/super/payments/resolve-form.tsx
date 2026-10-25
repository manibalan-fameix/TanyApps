"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/lib/toast"

import { resolvePaymentException } from "./actions"

export function ResolveForm({ id }: { id: string }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [pending, start] = useTransition()
  return (
    <form
      className="flex min-w-56 flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await resolvePaymentException(id, note)
          if (res.ok) {
            toast.success("Resolved.")
            router.refresh()
          } else toast.error(res.error ?? "Could not resolve.")
        })
      }}
    >
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you did" aria-label="What you did" maxLength={500} />
      <Button type="submit" size="sm" variant="outline" disabled={pending || note.trim().length < 5}>
        Resolve
      </Button>
    </form>
  )
}
