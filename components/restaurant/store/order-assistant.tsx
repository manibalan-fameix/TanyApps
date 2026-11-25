"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { BubbleChatIcon, Cancel01Icon, Image01Icon, SendHorizontalIcon, ShoppingCart01Icon, TickDouble02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { MediaBlock } from "@/components/restaurant/store/order-assistant-cards"
import { useStoreTerms } from "@/components/restaurant/store/terms-context"
import { Attachment, AttachmentAction, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Message, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatRupees } from "@/lib/restaurant/menu"
import { greeting, imageReply, respond, type BotAction, type BotContext, type BotMedia, type BotOption, type BotReply } from "@/lib/restaurant/order-bot"
import type { StoreCategory, StoreDish } from "@/lib/restaurant/storefront"
import { resizeToJpeg } from "@/lib/image/resize"
import { cn } from "@/lib/utils"

type Turn = { id: number; role: "bot" | "user"; text: string; image?: string; time: string; media?: BotMedia; options?: BotOption[] }

const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
/** How long the bot "types" before a reply lands. Short enough to feel instant, long enough to read as a person. */
const TYPING_MS = 700
/** Photos are shrunk in the browser before they are sent: smaller upload, faster answer, and no location data in the file. */
const PHOTO_EDGE = 1024

type Photo = { blob: Blob; url: string }

const WALLPAPER: CSSProperties = { backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "18px 18px" }

function TypingDots() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-sm bg-card px-3.5 py-3 shadow-sm" aria-label="Typing">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  )
}

/**
 * A WhatsApp-style ordering assistant. The guest taps quick replies, swipes through dish and category cards with photos,
 * picks size and quantity, and ends at checkout, or types a name to search. Scripted from the storefront's own data, so
 * it never invents a dish or a price, and the server still re-prices the cart at checkout.
 */
export function OrderAssistant({
  dishes,
  categories,
  canOrder,
  name,
  logoUrl,
  themeVars,
}: {
  dishes: StoreDish[]
  categories: StoreCategory[]
  canOrder: boolean
  name: string
  logoUrl: string | null
  themeVars: CSSProperties
}) {
  const pathname = usePathname()
  const cart = useCart()
  const terms = useStoreTerms()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState("")
  const nextId = useRef(0)
  const alive = useRef(true)
  const urls = useRef<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)

  const ctx = useMemo<BotContext>(() => ({ dishes, categories, canOrder, terms, cart: cart.lines }), [dishes, categories, canOrder, terms, cart.lines])
  const ctxRef = useRef(ctx)
  const cartRef = useRef(cart)
  useEffect(() => {
    ctxRef.current = ctx
    cartRef.current = cart
  })
  useEffect(() => {
    alive.current = true
    const made = urls.current
    return () => {
      alive.current = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  const botTurn = (r: BotReply): Turn => ({ id: nextId.current++, role: "bot", text: r.text, time: clock(), media: r.media, options: r.options })

  /** Show "typing…" for at least a beat, then land the reply (and apply any cart change with it). */
  const reply = async (build: () => BotReply | Promise<BotReply>) => {
    setTyping(true)
    const [r] = await Promise.all([Promise.resolve().then(build), new Promise((done) => setTimeout(done, TYPING_MS))])
    if (!alive.current) return
    if (r.clearCart) cartRef.current.clear()
    setTurns((all) => [...all, botTurn(r)])
    setTyping(false)
  }

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o && turns.length === 0) reply(() => greeting(ctxRef.current))
  }

  const say = (action: BotAction, said: string) => {
    if (typing) return
    setTurns((all) => [...all, { id: nextId.current++, role: "user", text: said, time: clock() }])
    reply(() => respond(action, ctxRef.current))
  }

  const choosePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !file.type.startsWith("image/")) return
    try {
      const { blob } = await resizeToJpeg(file, PHOTO_EDGE, 0.8)
      const url = URL.createObjectURL(blob)
      urls.current.push(url)
      setPhoto({ blob, url })
    } catch {
      // Not a picture the browser can read (a damaged or unsupported file): nothing to attach.
    }
  }

  const sendPhoto = () => {
    if (!photo || typing) return
    const sent = photo
    setPhoto(null)
    setTurns((all) => [...all, { id: nextId.current++, role: "user", text: "", image: sent.url, time: clock() }])
    void reply(async () => {
      try {
        const body = new FormData()
        body.append("image", sent.blob, "photo.jpg")
        const res = await fetch("/api/t/dish-match", { method: "POST", body, signal: AbortSignal.timeout(25_000) })
        if (!res.ok) return imageReply(null, ctxRef.current)
        const data: { ids?: unknown } = await res.json()
        return imageReply(Array.isArray(data.ids) ? data.ids.filter((x): x is string => typeof x === "string") : null, ctxRef.current)
      } catch {
        return imageReply(null, ctxRef.current)
      }
    })
  }

  const pick = (o: BotOption) => {
    if ("href" in o) {
      setOpen(false)
      return
    }
    say(o.action, o.label)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (photo) return sendPhoto()
    const q = draft.trim()
    if (!q || typing) return
    setDraft("")
    say({ t: "search", q }, q)
  }

  if (pathname.startsWith("/checkout") || pathname.startsWith("/cart") || pathname.startsWith("/monthly")) return null

  const lastBot = [...turns].reverse().find((t) => t.role === "bot")?.id
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        aria-label="Order with assistant"
        className={cn(
          "fixed right-3 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 md:right-6 md:bottom-6 md:px-4",
          // Phones: sit above the bottom bar, and above the View Cart pill once it appears, so nothing overlaps.
          cart.count > 0 ? "bottom-[calc(10.25rem+var(--safe-area-inset-bottom,0px))]" : "bottom-[calc(5rem+var(--safe-area-inset-bottom,0px))]",
        )}
      >
        <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} className="size-5" />
        <span className="hidden sm:inline">Order on chat</span>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        showCloseButton={false}
        style={themeVars}
        className="flex flex-col gap-0 overflow-hidden p-0 data-[side=bottom]:h-[85dvh] data-[side=bottom]:rounded-t-2xl md:h-full data-[side=right]:md:w-[34rem] data-[side=right]:md:max-w-[34rem]"
      >
        <header className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-foreground/20 text-base font-bold">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base leading-tight font-semibold text-primary-foreground">{name}</SheetTitle>
            <SheetDescription className="text-xs text-primary-foreground/80">{typing ? "typing…" : "Order assistant · online"}</SheetDescription>
          </div>
          <button type="button" aria-label={`Cart, ${cart.count} items`} disabled={typing} onClick={() => say({ t: "cart" }, "My cart")} className="relative flex size-9 items-center justify-center rounded-full hover:bg-primary-foreground/15 disabled:opacity-60">
            <HugeiconsIcon icon={ShoppingCart01Icon} strokeWidth={2} className="size-5" />
            {cart.count > 0 ? <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] leading-4 font-bold text-primary">{cart.count}</span> : null}
          </button>
          <SheetClose aria-label="Close chat" className="flex size-9 items-center justify-center rounded-full hover:bg-primary-foreground/15">
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-5" />
          </SheetClose>
        </header>

        <MessageScrollerProvider autoScroll>
          <MessageScroller className="flex-1 bg-muted/60" style={WALLPAPER}>
            <MessageScrollerViewport className="px-3 py-3">
              <MessageScrollerContent className="gap-2">
                <div className="mx-auto mb-1 rounded-lg bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">Today</div>
                {turns.map((t) => {
                  const mine = t.role === "user"
                  const live = t.id === lastBot && !typing
                  return (
                    <MessageScrollerItem key={t.id} messageId={String(t.id)} scrollAnchor={mine} className="animate-in duration-200 fade-in slide-in-from-bottom-2">
                      <Message align={mine ? "end" : "start"} className="gap-0">
                        <MessageContent className={cn("gap-1.5", mine ? "items-end" : "w-full items-start")}>
                          <Bubble align={mine ? "end" : "start"} variant={mine ? "default" : "outline"} className="max-w-[85%] shadow-sm">
                            <BubbleContent className={cn("px-3 py-1.5 leading-snug", mine ? "rounded-2xl rounded-tr-sm" : "rounded-2xl rounded-tl-sm border-transparent bg-card")}>
                              {t.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={t.image} alt="Your photo" className="mb-1 max-h-64 w-56 max-w-full rounded-xl object-cover" />
                              ) : null}
                              {t.text}
                              <span className={cn("float-right mt-1.5 ml-3 inline-flex items-center gap-1 text-[10px] leading-none", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                {t.time}
                                {mine ? <HugeiconsIcon icon={TickDouble02Icon} strokeWidth={2} className="size-3.5" /> : null}
                              </span>
                            </BubbleContent>
                          </Bubble>
                          {t.media ? (
                            <div className="w-full">
                              <MediaBlock media={t.media} dishes={dishes} canOrder={canOrder} onPick={say} live={live} />
                            </div>
                          ) : null}
                          {t.options && t.id === lastBot ? (
                            <div className="flex w-full flex-wrap gap-1.5">
                              {t.options.map((o) => {
                                const row = "inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-[13px] font-semibold text-info shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                                const label = (
                                  <>
                                    {o.label}
                                    {o.hint ? <span className="font-medium text-muted-foreground">{o.hint}</span> : null}
                                  </>
                                )
                                return "href" in o ? (
                                  <Link key={o.label} href={o.href} onClick={() => pick(o)} className={row}>
                                    {label}
                                  </Link>
                                ) : (
                                  <button key={o.label + o.hint} type="button" disabled={!live} onClick={() => pick(o)} className={row}>
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          ) : null}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                })}
                {typing ? (
                  <MessageScrollerItem messageId="typing" className="animate-in duration-150 fade-in">
                    <TypingDots />
                  </MessageScrollerItem>
                ) : null}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        <div className="border-t border-border bg-background">
          {cart.count > 0 && canOrder ? (
            <button
              type="button"
              disabled={typing}
              onClick={() => say({ t: "cart" }, "View cart")}
              className="mx-2.5 mt-2.5 flex w-[calc(100%-1.25rem)] items-center justify-between gap-3 rounded-xl bg-primary px-4 py-2.5 text-left text-primary-foreground shadow-sm transition-opacity disabled:opacity-60"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <HugeiconsIcon icon={ShoppingCart01Icon} strokeWidth={2} className="size-4" />
                {cart.count} {cart.count === 1 ? "item" : "items"} · {formatRupees(cart.subtotal)}
              </span>
              <span className="text-sm font-bold">View cart ›</span>
            </button>
          ) : null}
          {photo ? (
            <div className="px-3 pt-2.5">
              <Attachment className="w-full">
                <AttachmentMedia variant="image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>Your photo</AttachmentTitle>
                  <AttachmentDescription>We will look for it on the {terms.catalogue.toLowerCase()}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentAction aria-label="Remove photo" onClick={() => setPhoto(null)}>
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </AttachmentAction>
              </Attachment>
            </div>
          ) : null}
          <form onSubmit={submit} className="p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={choosePhoto} />
            <InputGroup className="h-10 rounded-full bg-card">
              <InputGroupAddon align="inline-start">
                <InputGroupButton type="button" size="icon-sm" variant="ghost" className="rounded-full" aria-label="Attach a photo" disabled={typing} onClick={() => fileInput.current?.click()}>
                  <HugeiconsIcon icon={Image01Icon} strokeWidth={2} />
                </InputGroupButton>
              </InputGroupAddon>
              <InputGroupInput value={draft} onChange={(e) => setDraft(e.target.value)} disabled={Boolean(photo)} placeholder={photo ? "Tap send to share your photo" : `Search a ${terms.item} or add a photo`} aria-label={terms.searchHint} />
              <InputGroupAddon align="inline-end">
                <InputGroupButton type="submit" size="icon-sm" variant="default" className="rounded-full" aria-label="Send" disabled={(!draft.trim() && !photo) || typing}>
                  <HugeiconsIcon icon={SendHorizontalIcon} strokeWidth={2} />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
