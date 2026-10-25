"use client"

import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import {
  connectRazorpayAccount,
  refreshAccountStatus,
} from "@/app/(admin)/(shell)/settings/payments/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const STATUS_LABEL: Record<string, string> = {
  created: "Pending KYC",
  under_review: "Pending KYC",
  needs_clarification: "Needs attention",
  activated: "Active",
  suspended: "Suspended",
}

export function PaymentsPanel({
  status,
  legalName,
  email,
  phone,
  city,
  purpose = "buyers can pay a booking amount online",
}: {
  status: string | null
  legalName: string
  email: string
  phone: string
  city: string
  purpose?: string
}) {
  const [form, setForm] = useState({ legalName, email, phone, city })
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  const connect = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await connectRazorpayAccount(form)
      if (res.ok) {
        toast.success(
          "Connected. Check your email from Razorpay to finish verification."
        )
        setError("")
      } else setError(res.error)
    })
  }

  const refresh = () => {
    start(async () => {
      const res = await refreshAccountStatus()
      if (res.ok) toast.success("Status refreshed.")
      else toast.error(res.error)
    })
  }

  if (!status) {
    return (
      <form onSubmit={connect} className="grid max-w-md gap-4">
        <p className="text-sm text-muted-foreground">
          Connect your bank account so {purpose},
          transferred straight to you. We never hold this money.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="pay-legal-name">Business / legal name</Label>
          <Input
            id="pay-legal-name"
            value={form.legalName}
            onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-email">Contact email</Label>
          <Input
            id="pay-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-phone">Contact phone</Label>
          <Input
            id="pay-phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-city">City</Label>
          <Input
            id="pay-city"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            required
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending} className="w-fit">
          Connect
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge variant={status === "activated" ? "default" : "secondary"}>
          {STATUS_LABEL[status] ?? status}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={refresh}
        >
          Refresh status
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {status === "activated"
          ? `You're all set. Now ${purpose}, transferred straight to your bank account.`
          : "Check your email from Razorpay to finish verifying your bank details and identity. Bookings can be paid online once that's done."}
      </p>
    </div>
  )
}
