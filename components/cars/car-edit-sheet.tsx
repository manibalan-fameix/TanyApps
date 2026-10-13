"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateCarAction } from "@/app/(admin)/(shell)/cars/actions"
import type { CarRow } from "@/components/cars/cars-grid"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { copy } from "@/lib/copy"
import { cn } from "@/lib/utils"

const t = copy.admin.cars
const e = t.edit

type Editable = "live" | "on_hold" | "sold" | "archived"
const STATUSES: Editable[] = ["live", "on_hold", "sold", "archived"]
const STATUS_ITEMS = Object.fromEntries(STATUSES.map((s) => [s, t.status[s]]))

type Form = {
  status: Editable
  price: string
  soldPrice: string
  km: string
  owners: string
  colour: string
  insurance: string
}

const toForm = (car: CarRow): Form => ({
  status: (STATUSES as string[]).includes(car.status)
    ? (car.status as Editable)
    : "live",
  price: car.price?.toString() ?? "",
  soldPrice: car.soldPrice?.toString() ?? "",
  km: car.km?.toString() ?? "",
  owners: car.owners?.toString() ?? "",
  colour: car.colour ?? "",
  insurance: car.insuranceValidTill ?? "",
})

const num = (v: string) =>
  v.trim() === "" ? null : Number(v.replace(/,/g, ""))

export function CarEditSheet({
  car,
  onClose,
}: {
  car: CarRow | null
  onClose: () => void
}) {
  return (
    <Sheet open={!!car} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {car && <EditForm key={car.id} car={car} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function EditForm({ car, onClose }: { car: CarRow; onClose: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [form, setForm] = useState<Form>(() => toForm(car))

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = () => {
    start(async () => {
      const res = await updateCarAction({
        carId: car.id,
        status: form.status,
        askingPrice: num(form.price),
        kmDriven: num(form.km),
        ownerCount: num(form.owners),
        colour: form.colour.trim() || null,
        insuranceValidTill: form.insurance || null,
        soldPrice: form.status === "sold" ? num(form.soldPrice) : null,
      })
      if (!res.ok) {
        toast.error(e.errors[res.error] ?? e.errors.invalid)
        return
      }
      toast.success(e.saved)
      router.refresh()
      onClose()
    })
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          {car.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={car.image}
              alt=""
              className="size-14 shrink-0 rounded-lg bg-muted object-cover"
            />
          ) : (
            <div className="size-14 shrink-0 rounded-lg bg-muted" />
          )}
          <div className="min-w-0">
            <SheetTitle className="truncate">{car.title}</SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              {car.reg}
              <Badge variant="secondary">{t.status[car.status]}</Badge>
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <FieldGroup className="px-4">
        <Field>
          <FieldLabel>{e.status}</FieldLabel>
          <Select
            items={STATUS_ITEMS}
            value={form.status}
            onValueChange={(v) => set("status", v as Editable)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t.status[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{e.statusHelp}</FieldDescription>
        </Field>

        {form.status === "sold" && (
          <Field>
            <FieldLabel htmlFor="sold-price">{e.soldPrice}</FieldLabel>
            <Input
              id="sold-price"
              inputMode="numeric"
              value={form.soldPrice}
              onChange={(ev) => set("soldPrice", ev.target.value)}
              placeholder={form.price}
            />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="price">{e.price}</FieldLabel>
          <Input
            id="price"
            inputMode="numeric"
            value={form.price}
            onChange={(ev) => set("price", ev.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="km">{e.km}</FieldLabel>
            <Input
              id="km"
              inputMode="numeric"
              value={form.km}
              onChange={(ev) => set("km", ev.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="owners">{e.owners}</FieldLabel>
            <Input
              id="owners"
              inputMode="numeric"
              value={form.owners}
              onChange={(ev) => set("owners", ev.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="colour">{e.colour}</FieldLabel>
          <Input
            id="colour"
            value={form.colour}
            onChange={(ev) => set("colour", ev.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="insurance">{e.insurance}</FieldLabel>
          <Input
            id="insurance"
            type="date"
            value={form.insurance}
            onChange={(ev) => set("insurance", ev.target.value)}
          />
        </Field>
      </FieldGroup>

      <SheetFooter>
        <Button onClick={save} disabled={pending}>
          {pending ? e.saving : e.save}
        </Button>
        <Link
          href={`/cars/new?car=${car.id}&step=photos`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          {e.editFull}
        </Link>
      </SheetFooter>
    </>
  )
}
