import { formatRupees } from "@/lib/restaurant/menu"
import { filterDishes, type StoreCategory, type StoreDish } from "@/lib/restaurant/storefront"
import type { StoreTerms } from "@/lib/verticals/terms"

/**
 * The scripted order assistant. No model: every reply is built from the storefront's own data and every choice is a
 * button, so a guest can order in a few taps. Pure and framework-free, the chat component only renders what it returns.
 */

export type BotAction =
  | { t: "home" }
  | { t: "categories" }
  | { t: "category"; id: string; page?: number }
  | { t: "filter"; key: "veg" | "bestseller" | "offer"; page?: number }
  | { t: "search"; q: string }
  | { t: "dish"; id: string }
  | { t: "cart" }
  | { t: "clear" }

export type BotOption = { label: string; hint?: string; action: BotAction } | { label: string; hint?: string; href: string }

export type BotMedia =
  | { kind: "dishes"; dishes: StoreDish[] }
  | { kind: "categories"; items: { id: string; name: string; slug: string; imageUrl: string | null }[] }
  /** The sizes of one dish, each with its own - 1 + control. */
  | { kind: "portions"; dish: StoreDish }
  /** The live cart, with - 1 + on every line. It reads the cart as it is now, so it never goes stale. */
  | { kind: "cart" }

export type BotReply = {
  text: string
  /** Photos and cards shown with the message. */
  media?: BotMedia
  options: BotOption[]
  clearCart?: boolean
}

export type BotContext = {
  dishes: StoreDish[]
  categories: StoreCategory[]
  canOrder: boolean
  terms: StoreTerms
  cart: { itemId: string; name: string; portion: string | null; price: number; qty: number }[]
}

const PAGE = 6

const visible = (c: BotContext) => c.dishes.filter((d) => d.isAvailable)

export function greeting(c: BotContext): BotReply {
  return {
    text: c.canOrder
      ? `Hi! I can help you order from this ${c.terms.business} in a few taps. What would you like to do?`
      : `Hi! We're not taking orders right now, but I can show you the ${c.terms.catalogue.toLowerCase()}.`,
    options: mainOptions(c),
  }
}

function mainOptions(c: BotContext): BotOption[] {
  const list = visible(c)
  const opts: BotOption[] = [{ label: `Browse ${c.terms.catalogue.toLowerCase()}`, action: { t: "categories" } }]
  if (c.terms.diet && list.some((d) => d.isVeg)) opts.push({ label: "Veg only", action: { t: "filter", key: "veg" } })
  if (list.some((d) => d.isFeatured)) opts.push({ label: "Bestsellers", action: { t: "filter", key: "bestseller" } })
  if (list.some((d) => d.compareAt !== null && d.compareAt > d.price)) opts.push({ label: "Offers", action: { t: "filter", key: "offer" } })
  opts.push({ label: c.cart.length ? `My cart (${c.cart.reduce((n, l) => n + l.qty, 0)})` : "My cart", action: { t: "cart" } })
  opts.push({ label: "Track my order", href: "/track-order" })
  return opts
}

const backOptions = (c: BotContext): BotOption[] => [
  { label: "Browse more", action: { t: "categories" } },
  { label: "Main menu", action: { t: "home" } },
  ...(c.cart.length ? [{ label: "View cart", action: { t: "cart" } as const }] : []),
]

/** A page of dish cards plus a "Show more" reply when there are more. */
function dishPage(list: StoreDish[], page: number, more: BotAction): { media: BotMedia; more: BotOption[] } {
  return {
    media: { kind: "dishes", dishes: list.slice(page * PAGE, (page + 1) * PAGE) },
    more: (page + 1) * PAGE < list.length ? [{ label: "Show more", action: more }] : [],
  }
}

export function respond(a: BotAction, c: BotContext): BotReply {
  const { terms } = c
  const list = visible(c)

  switch (a.t) {
    case "home":
      return { text: "What would you like to do?", options: mainOptions(c) }

    case "categories": {
      const cats = c.categories.filter((cat) => list.some((d) => d.categoryId === cat.id))
      if (cats.length === 0) return { text: `There's nothing on the ${terms.catalogue.toLowerCase()} yet.`, options: [{ label: "Main menu", action: { t: "home" } }] }
      const items = cats.map((cat) => {
        const inCat = list.filter((d) => d.categoryId === cat.id)
        return { id: cat.id, name: cat.name, slug: cat.slug, imageUrl: inCat.find((d) => d.imageUrl)?.imageUrl ?? null }
      })
      return { text: "Here's what we have. Tap a category to see it 👇", media: { kind: "categories", items }, options: [{ label: "Main menu", action: { t: "home" } }] }
    }

    case "category": {
      const cat = c.categories.find((x) => x.id === a.id)
      const items = list.filter((d) => d.categoryId === a.id)
      const page = a.page ?? 0
      if (!cat || items.length === 0) return { text: `Nothing available in that category right now.`, options: backOptions(c) }
      const pg = dishPage(items, page, { t: "category", id: a.id, page: page + 1 })
      return {
        text: page === 0 ? `${cat.name} 😋 Tap ADD to order.` : `More from ${cat.name}:`,
        media: pg.media,
        options: [...pg.more, { label: "Other categories", action: { t: "categories" } }],
      }
    }

    case "filter": {
      const items = filterDishes(list, "", new Set([a.key]))
      const page = a.page ?? 0
      const title = a.key === "veg" ? "Veg" : a.key === "bestseller" ? "Bestsellers" : "Offers"
      if (items.length === 0) return { text: `No ${title.toLowerCase()} ${terms.items} right now.`, options: backOptions(c) }
      const pg = dishPage(items, page, { t: "filter", key: a.key, page: page + 1 })
      return {
        text: page === 0 ? `${title} 😋 Tap ADD to order.` : `More ${title.toLowerCase()}:`,
        media: pg.media,
        options: [...pg.more, { label: "Main menu", action: { t: "home" } }],
      }
    }

    case "search": {
      const items = filterDishes(list, a.q, new Set())
      if (items.length === 0) return { text: `I couldn't find "${a.q}". Try another name, or browse by category.`, options: mainOptions(c) }
      return {
        text: `Found ${items.length} for "${a.q}" 🔎`,
        media: { kind: "dishes", dishes: items.slice(0, PAGE) },
        options: [{ label: "Main menu", action: { t: "home" } }],
      }
    }

    case "dish": {
      const d = c.dishes.find((x) => x.id === a.id)
      if (!d || !d.isAvailable) return { text: `Sorry, that ${terms.item} isn't available right now.`, options: backOptions(c) }
      if (!c.canOrder) return { text: `${d.name} is ${formatRupees(d.price)}. We're not taking orders right now.`, options: backOptions(c) }
      return { text: `${d.name}: pick a size and how many.`, media: { kind: "portions", dish: d }, options: [{ label: `More ${terms.items}`, action: { t: "categories" } }, { label: "View cart", action: { t: "cart" } }] }
    }

    case "cart": {
      if (c.cart.length === 0) return { text: "Your cart is empty.", options: [{ label: `Browse ${terms.catalogue.toLowerCase()}`, action: { t: "categories" } }, { label: "Main menu", action: { t: "home" } }] }
      return {
        text: "Here's your cart 🛒 Use − and + to change it.",
        media: { kind: "cart" },
        options: [
          { label: "Checkout", href: "/checkout" },
          { label: `Add more ${terms.items}`, action: { t: "categories" } },
          { label: "Clear cart", action: { t: "clear" } },
        ],
      }
    }

    case "clear":
      return { text: "Your cart is empty now.", clearCart: true, options: [{ label: `Browse ${terms.catalogue.toLowerCase()}`, action: { t: "categories" } }] }
  }
}

/** The reply to a guest's photo. `ids` are the menu matches the server found; null means the photo could not be looked at. */
export function imageReply(ids: string[] | null, c: BotContext): BotReply {
  if (ids === null) return { text: `I couldn't look at that photo right now. You can browse the ${c.terms.catalogue.toLowerCase()} or type a ${c.terms.item} name instead.`, options: mainOptions(c) }
  const found = ids.map((id) => c.dishes.find((d) => d.id === id)).filter((d): d is StoreDish => Boolean(d && d.isAvailable))
  if (found.length === 0) return { text: `I couldn't find anything like that on our ${c.terms.catalogue.toLowerCase()}. Try another photo, or browse below.`, options: mainOptions(c) }
  return {
    text: found.length === 1 ? "That looks like this 👇" : `That looks like these ${found.length} 👇`,
    media: { kind: "dishes", dishes: found },
    options: [{ label: "Main menu", action: { t: "home" } }],
  }
}
