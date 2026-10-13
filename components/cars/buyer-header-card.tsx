"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Location01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { createBooking } from "@/app/(tenant)/sites/[dealer]/[carSlug]/actions"
import { authoriseBookingPayment } from "@/components/cars/booking-checkout"
import { calculateEmi, EmiCalculator } from "@/components/cars/emi-calculator"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const inr = new Intl.NumberFormat("en-IN")
const money = (value: number) => `₹${inr.format(Math.round(value))}`

function BookingDialog({
  dealerSlug,
  carSlug,
  amount,
}: {
  dealerSlug: string
  carSlug: string
  amount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await createBooking({
        dealerSlug,
        carSlug,
        buyerName: name,
        buyerPhone: phone,
      })
      if (!res.ok) return void setError(res.error)
      setError("")
      const result = await authoriseBookingPayment(res.checkout, {
        carSlug,
        description: `Booking amount for ${carSlug}`,
        color: "#1d4ed8",
        prefill: { name, contact: phone },
      })
      if (result === "done") {
        toast.success("Booking confirmed. The dealer will contact you shortly.")
        setOpen(false)
      } else if (result === "unconfirmed") {
        toast.message(
          "Payment received. It can take a minute to confirm. Refresh shortly."
        )
        setOpen(false)
      } else if (result === "unavailable") {
        toast.error(
          "Could not load the payment window. Check your connection and try again."
        )
      } else {
        toast.error("Payment was not completed. You have not been charged.")
      }
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="lg" className="col-span-2 h-10 w-full" />}
      >
        Pay booking amount ({money(amount)})
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Pay booking amount</DialogTitle>
            <DialogDescription>
              This reserves the car. The amount is paid directly to the dealer.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="booking-name">Your name</Label>
            <Input
              id="booking-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="booking-phone">Mobile number</Label>
            <Input
              id="booking-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending} className="w-full">
              Pay {money(amount)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function BuyerHeaderCard({
  title,
  facts,
  location,
  dealerPhone,
  price,
  pricing,
  booking,
}: {
  title: string
  facts: string[]
  location: string | null
  dealerPhone: string | null
  price: number | null
  pricing: {
    loanAmount: number | null
    downPayment: number | null
    loanDurationMonths: number | null
    interestRate: number | null
    bookingAmount: number | null
    tokenRefundable: boolean
  }
  /** Online booking payment, only offered once the dealer's payout account is active. */
  booking: { dealerSlug: string; carSlug: string; canPayOnline: boolean }
}) {
  const [showEmi, setShowEmi] = useState(false)

  const roundedPrice = price ? Math.max(0, Math.round(price)) : 0
  const defaultDownPayment =
    pricing.downPayment ??
    (pricing.loanAmount
      ? roundedPrice - pricing.loanAmount
      : Math.round(roundedPrice * 0.2))
  const startingLoanAmount = Math.max(0, roundedPrice - defaultDownPayment)
  const startingDuration = pricing.loanDurationMonths ?? 60
  const startingRate = pricing.interestRate ?? 10.99
  const startingEmi = price
    ? calculateEmi(startingLoanAmount, startingRate, startingDuration)
    : null

  return (
    <div className="rounded-lg bg-muted p-5">
      <h1 className="text-2xl font-medium tracking-tight lg:text-3xl">
        {title}
      </h1>

      {facts.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <span
              key={fact}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium"
            >
              {fact}
            </span>
          ))}
        </div>
      ) : null}

      {location ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <HugeiconsIcon
            icon={Location01Icon}
            strokeWidth={2}
            className="size-4 shrink-0"
          />
          {location}
        </div>
      ) : null}

      <div className="my-5 border-t border-border" />

      <p className="text-sm text-muted-foreground">Car price</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">
        {price ? money(price) : "Price on request"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Price excludes insurance transfer, RTO charges and taxes where
        applicable.
      </p>
      {pricing.bookingAmount ? (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">Booking amount </span>
          <span className="font-semibold">
            {money(pricing.bookingAmount)}
            {pricing.tokenRefundable ? " (refundable)" : ""}
          </span>
        </p>
      ) : null}

      {price && startingEmi ? (
        <>
          <div className="my-5 border-t border-border" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Starting EMI</p>
              <p className="text-lg font-semibold">
                or {money(startingEmi)} / m
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEmi((v) => !v)}
            >
              {showEmi ? "Hide EMI calculator" : "Calculate your EMI"}
            </Button>
          </div>
          {showEmi ? (
            <div className="mt-4">
              <EmiCalculator
                price={price}
                initialLoanAmount={pricing.loanAmount}
                initialDownPayment={pricing.downPayment}
                initialDurationMonths={pricing.loanDurationMonths}
                interestRate={pricing.interestRate}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        {booking.canPayOnline && pricing.bookingAmount ? (
          <BookingDialog
            dealerSlug={booking.dealerSlug}
            carSlug={booking.carSlug}
            amount={pricing.bookingAmount}
          />
        ) : dealerPhone ? (
          <>
            <a
              href={`tel:${dealerPhone}`}
              className={cn(buttonVariants({ size: "lg" }), "h-10 w-full")}
            >
              Continue
            </a>
            <a
              href={`tel:${dealerPhone}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-10 w-full"
              )}
            >
              Request a callback
            </a>
          </>
        ) : (
          <Button size="lg" className="col-span-2 h-10 w-full" disabled>
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}
