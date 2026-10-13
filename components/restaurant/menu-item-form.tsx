"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createMenuItem,
  deleteMenuItem,
  updateMenuItem,
} from "@/app/(admin)/(shell)/menu/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { ImageUpload } from "@/components/restaurant/image-upload"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MAX_PORTIONS, type MenuItemDraft } from "@/lib/restaurant/menu"

const NONE = "none"

export type CategoryOption = { id: string; name: string }

export function MenuItemForm({
  categories,
  itemId,
  initial,
  onDone,
}: {
  categories: CategoryOption[]
  /** Set when editing an existing dish. */
  itemId?: string
  initial?: MenuItemDraft
  /** In the edit panel: called after a save or delete instead of leaving the page. */
  onDone?: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? NONE)
  const [price, setPrice] = useState(String(initial?.price ?? ""))
  const [compareAt, setCompareAt] = useState(initial?.compareAtPrice ? String(initial.compareAtPrice) : "")
  const [portions, setPortions] = useState(
    (initial?.portions ?? []).map((p) => ({ label: p.label, price: String(p.price) }))
  )
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "")
  const [isVeg, setIsVeg] = useState(initial?.isVeg ?? true)
  const [isAvailable, setIsAvailable] = useState(initial?.isAvailable ?? true)
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false)

  const items = [
    { value: NONE, label: "No category" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ]

  const draft = (): MenuItemDraft => ({
    name,
    description,
    categoryId: categoryId === NONE ? null : categoryId,
    price: Number(price),
    compareAtPrice: compareAt ? Number(compareAt) : null,
    portions: portions.map((p) => ({ label: p.label, price: Number(p.price) })),
    imageUrl,
    isVeg,
    isAvailable,
    isFeatured,
  })

  function submit() {
    setErrors({})
    start(async () => {
      const res = itemId
        ? await updateMenuItem(itemId, draft())
        : await createMenuItem(draft())
      if (res.ok) {
        toast.success(itemId ? "Dish saved." : "Dish added.")
        if (onDone) onDone()
        else router.push("/menu")
        router.refresh()
        return
      }
      if (res.fieldErrors) setErrors(res.fieldErrors)
      toast.error(res.error)
    })
  }

  function remove() {
    if (!itemId || !window.confirm("Delete this dish? This cannot be undone.")) return
    start(async () => {
      const res = await deleteMenuItem(itemId)
      if (res.ok) {
        toast.success("Dish deleted.")
        if (onDone) onDone()
        else router.push("/menu")
        router.refresh()
      } else toast.error(res.error)
    })
  }

  return (
    <FieldGroup className={onDone ? undefined : "max-w-xl"}>
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="dish-name">Dish name</FieldLabel>
        <Input
          id="dish-name"
          value={name}
          placeholder="Chettinad chicken curry"
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name ? <FieldError>{errors.name}</FieldError> : null}
      </Field>

      <Field data-invalid={Boolean(errors.description)}>
        <FieldLabel htmlFor="dish-description">Description</FieldLabel>
        <Textarea
          id="dish-description"
          value={description}
          rows={3}
          placeholder="Slow-cooked with freshly ground spices."
          onChange={(e) => setDescription(e.target.value)}
        />
        {errors.description ? <FieldError>{errors.description}</FieldError> : null}
      </Field>

      <Field>
        <FieldLabel>Category</FieldLabel>
        <Select items={items} value={categoryId} onValueChange={(v) => setCategoryId(String(v))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>Create categories under Menu → Categories.</FieldDescription>
      </Field>

      <Field data-invalid={Boolean(errors.price)}>
        <FieldLabel htmlFor="dish-price">Price (₹)</FieldLabel>
        <Input
          id="dish-price"
          inputMode="numeric"
          value={price}
          placeholder="250"
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
        />
        {errors.price ? <FieldError>{errors.price}</FieldError> : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="dish-compare">Original price (₹, optional)</FieldLabel>
        <Input
          id="dish-compare"
          inputMode="numeric"
          value={compareAt}
          placeholder="300"
          onChange={(e) => setCompareAt(e.target.value.replace(/\D/g, ""))}
        />
        <FieldDescription>Higher than the price above? The dish shows as on offer, with the old price crossed out.</FieldDescription>
      </Field>

      <Field data-invalid={Boolean(errors.portions)}>
        <FieldLabel>Portions (optional)</FieldLabel>
        <FieldDescription>
          Add sizes like Half and Full. Guests see the lowest price as &quot;from&quot;.
        </FieldDescription>
        {portions.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`Portion ${i + 1} name`}
              value={p.label}
              placeholder="Half"
              onChange={(e) =>
                setPortions((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
            />
            <Input
              aria-label={`Portion ${i + 1} price`}
              className="w-28"
              inputMode="numeric"
              value={p.price}
              placeholder="₹"
              onChange={(e) =>
                setPortions((all) =>
                  all.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/\D/g, "") } : x))
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPortions((all) => all.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </div>
        ))}
        {portions.length < MAX_PORTIONS ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setPortions((all) => [...all, { label: "", price: "" }])}
          >
            Add portion
          </Button>
        ) : null}
        {errors.portions ? <FieldError>{errors.portions}</FieldError> : null}
      </Field>

      <Field data-invalid={Boolean(errors.imageUrl)}>
        <FieldLabel>Photo (optional)</FieldLabel>
        <ImageUpload kind="menu" label="photo" value={imageUrl} onChange={setImageUrl} />
        <FieldDescription>A bright, close-up photo helps guests order. JPG, PNG or a phone photo.</FieldDescription>
        {errors.imageUrl ? <FieldError>{errors.imageUrl}</FieldError> : null}
      </Field>

      <div className="grid gap-3">
        <Field orientation="horizontal">
          <Checkbox checked={isVeg} onCheckedChange={(v) => setIsVeg(Boolean(v))} id="dish-veg" />
          <FieldLabel htmlFor="dish-veg">Vegetarian</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            checked={isAvailable}
            onCheckedChange={(v) => setIsAvailable(Boolean(v))}
            id="dish-available"
          />
          <FieldLabel htmlFor="dish-available">Available today</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            checked={isFeatured}
            onCheckedChange={(v) => setIsFeatured(Boolean(v))}
            id="dish-featured"
          />
          <FieldLabel htmlFor="dish-featured">Show as a bestseller</FieldLabel>
        </Field>
      </div>

      <div className="flex items-center justify-between gap-2">
        {itemId ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
            Delete dish
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => (onDone ? onDone() : router.push("/menu"))}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Saving..." : itemId ? "Save changes" : "Add dish"}
          </Button>
        </div>
      </div>
    </FieldGroup>
  )
}
