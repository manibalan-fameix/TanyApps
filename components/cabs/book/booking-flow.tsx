"use client"

import { Clock01Icon, HistoryIcon, Route01Icon } from "@hugeicons/core-free-icons"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"

import { EmptyState } from "@/components/cabs/book/empty-state"
import { FilledIcon } from "@/components/cabs/book/filled-icon"
import { FareLines } from "@/components/cabs/book/fare-lines"
import { ListRow } from "@/components/cabs/book/list-row"
import { distanceLabel, useLiveLocation } from "@/components/cabs/book/use-live-location"
import { PlaceField, type PickedPlace, type QuickPickItem } from "@/components/cabs/book/place-field"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { type MessageKey, bookingMessage, bookingText } from "@/lib/cabs/booking-copy"
import type { Lang } from "@/lib/cabs/lang"
import { formatPaise } from "@/lib/cabs/money"
import { type FareOption, getQuotes, requestBooking } from "@/lib/cabs/public-actions"
import { cn } from "@/lib/utils"

type Tab = "airport" | "oneway" | "round" | "local" | "tour"
const TRIP_OF: Record<Tab, "airport" | "outstation_one_way" | "outstation_round" | "local_hourly" | "package_tour"> = { airport: "airport", oneway: "outstation_one_way", round: "outstation_round", local: "local_hourly", tour: "package_tour" }
const TAB_OF = Object.fromEntries(Object.entries(TRIP_OF).map(([k, v]) => [v, k])) as Record<string, Tab>

export type LocalPackageOption = { hours: number; km: number }
export type TourOption = { id: string; name: string; days: number }

export type RecentRide = { id: string; route: string; when: string; lat: number | null; lng: number | null }

export type InitialDraft = { tripType: string; pickup: PickedPlace; drop: PickedPlace; pax: number; bags: number; localPackage: string; packageId: string }

type State = { tab: Tab; pickup: PickedPlace; drop: PickedPlace; startAt: string; returnAt: string; pax: number; bags: number; localPackage: string; packageId: string }

const blank = (): State => ({ tab: "airport", pickup: null, drop: null, startAt: "", returnAt: "", pax: 2, bags: 1, localPackage: "", packageId: "" })

function toDraft(s: State) {
  const [h, k] = s.localPackage.split(":").map(Number)
  return {
    tripType: TRIP_OF[s.tab],
    pickup: s.pickup?.token ?? "",
    drop: s.tab === "local" || s.tab === "tour" ? null : (s.drop?.token ?? null),
    startAt: s.startAt,
    returnAt: s.tab === "round" ? s.returnAt || null : null,
    pax: s.pax,
    bags: s.bags,
    localPackage: s.tab === "local" && h && k ? { hours: h, km: k } : null,
    packageId: s.tab === "tour" && s.packageId ? s.packageId : null,
  }
}

function Stepper({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3" role="group" aria-labelledby={id}>
        <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</Button>
        <span className="w-8 text-center text-lg tabular-nums" data-testid={`${id}-value`}>{value}</span>
        <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</Button>
      </div>
    </div>
  )
}

export type Section = "rides" | "vacation"

const RIDE_TABS = ["airport", "oneway", "round", "local"] as const

export function BookingFlow({ section, greeting, operator, lang, signedIn, minStart, quick, localPackages, tours, initial, resume, recent }: { section: Section; greeting: string; operator: string; lang: Lang; signedIn: boolean; minStart: string; quick: QuickPickItem[]; localPackages: LocalPackageOption[]; tours: TourOption[]; initial?: InitialDraft | null; resume: boolean; recent: RecentRide[] }) {
  const t = bookingText(lang)
  const router = useRouter()
  const [step, setStep] = useState<"search" | "details" | "vehicles" | "review">(initial ? "details" : "search")
  const [s, setS] = useState<State>(() => (initial ? { ...blank(), tab: section === "vacation" ? "tour" : TAB_OF[initial.tripType] && TAB_OF[initial.tripType] !== "tour" ? TAB_OF[initial.tripType]! : "airport", pickup: initial.pickup, drop: initial.drop, pax: initial.pax, bags: initial.bags, localPackage: initial.localPackage, packageId: initial.packageId } : { ...blank(), tab: section === "vacation" ? "tour" : "airport" }))
  const [options, setOptions] = useState<FareOption[]>([])
  const [meta, setMeta] = useState<{ km: number | null; min: number | null }>({ km: null, min: null })
  const [chosen, setChosen] = useState<FareOption | null>(null)
  const [sheet, setSheet] = useState<FareOption | null>(null)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [loggedIn, setLoggedIn] = useState(signedIn)
  const [showRecent, setShowRecent] = useState(false)
  const here = useLiveLocation()
  const [pending, start] = useTransition()
  // The airport and station list is drawn below the trip-type icons, so the icons stay right under the search.
  const [quickHost, setQuickHost] = useState<HTMLElement | null>(null)
  const storeKey = "tany-booking-draft"

  const needsDrop = s.tab === "airport" || s.tab === "oneway" || s.tab === "round"
  const text = (key: string, params: Record<string, string> = {}) => bookingMessage(lang, key as MessageKey, params)
  const errorText = (code: string, params: Record<string, string> = {}) => {
    const key = `err_${code}` as MessageKey
    return key in t ? text(key, { operator, ...params }) : t.err_generic
  }

  const problem = useMemo(() => {
    if (!s.pickup) return t.needPickup
    if (needsDrop && !s.drop) return t.needDrop
    if (!s.startAt) return t.needWhen
    if (s.tab === "round" && !s.returnAt) return t.needReturn
    if (s.tab === "local" && !s.localPackage) return t.needPackage
    if (s.tab === "tour" && !s.packageId) return t.needPackage
    return ""
  }, [s, needsDrop, t])

  /** The home screen only asks where to. Once the places (and the package, for Local and tours) are in, it moves on to the date and passengers. */
  function advanceIf(n: State) {
    const drop = n.tab === "airport" || n.tab === "oneway" || n.tab === "round"
    const ready = n.pickup && (!drop || n.drop) && (n.tab !== "local" || n.localPackage) && (n.tab !== "tour" || n.packageId)
    if (ready) setStep("details")
  }

  function search(then: "vehicles" | "review" = "vehicles", pick?: string) {
    setError("")
    if (problem) return setError(problem)
    start(async () => {
      const res = await getQuotes(toDraft(s))
      if (!res.ok) return setError(errorText(res.code))
      setOptions(res.options)
      setMeta({ km: res.distanceKm, min: res.durationMin })
      const match = pick ? res.options.find((o) => o.classId === pick) : null
      setChosen(match ?? null)
      setStep(match && then === "review" ? "review" : "vehicles")
    })
  }

  // After the phone login the customer lands back here: put the trip back and go straight to the review.
  // Restoring a draft from sessionStorage can only happen after the page has loaded in the browser.
  /* eslint-disable react-hooks/set-state-in-effect -- the saved draft does not exist on the server, so it cannot be the initial state */
  useEffect(() => {
    if (!resume || !signedIn) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) ?? "null") as { s: State; classId: string; notes: string } | null
      if (!saved) return
      sessionStorage.removeItem(storeKey)
      setS(saved.s)
      setNotes(saved.notes)
      start(async () => {
        const res = await getQuotes(toDraft(saved.s))
        if (!res.ok) return void (setStep("search"), setError(errorText(res.code)))
        setOptions(res.options)
        setMeta({ km: res.distanceKm, min: res.durationMin })
        const match = res.options.find((o) => o.classId === saved.classId) ?? null
        setChosen(match)
        setStep(match ? "review" : "vehicles")
      })
    } catch {
      /* private mode or blocked storage: start again */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Remembers the trip so it can be put back after the phone login. The login itself is a plain link to a route handler. */
  function rememberDraft() {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ s, classId: chosen?.classId, notes }))
    } catch {
      /* the customer simply starts again after logging in */
    }
  }
  const loginHref = `/api/t/auth/start?next=${encodeURIComponent("/?resume=1")}&lang=${lang}`

  function book() {
    if (!chosen) return
    setError("")
    start(async () => {
      const res = await requestBooking(toDraft(s), chosen.classId, chosen.totalPaise, notes)
      if (res.ok) {
        router.push(`/my/bookings/${res.id}?new=1`)
        return
      }
      if (res.code === "signed_out") setLoggedIn(false) // the session ended meanwhile: show the verify button
      setError(errorText(res.code, { amount: res.newTotalPaise !== undefined ? formatPaise(res.newTotalPaise) : "" }))
      if (res.code === "fare_changed") search("vehicles")
    })
  }

  const when = (v: string) => (v ? new Date(`${v}:00+05:30`).toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "")

  if (step === "vehicles") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t.vehiclesTitle}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep("search")}>{t.changeSearch}</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {[s.pickup?.name, needsDrop ? s.drop?.name : null].filter(Boolean).join(" → ")} · {when(s.startAt)}
          {meta.km !== null ? ` · ${meta.min ? t.tripSummary.replace("{km}", String(meta.km)).replace("{min}", String(meta.min)) : t.tripSummaryKm.replace("{km}", String(meta.km))}` : ""}
        </p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => (
            <Card key={o.classId} data-testid={`vehicle-${o.name}`}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{o.name}</p>
                    <p className="text-xs text-muted-foreground">{[t.seatsN.replace("{n}", String(o.seats)), t.bagsN.replace("{n}", String(o.bags)), o.ac ? t.acLabel : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{t.totalFare}</p>
                    <p className="text-lg font-semibold tabular-nums" data-testid="vehicle-fare">{formatPaise(o.totalPaise)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setSheet(o)}>{t.fareDetails}</Button>
                  <Button type="button" className="h-11 flex-1" onClick={() => { setChosen(o); setStep("review") }}>{t.selectVehicle}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
          <SheetContent side="bottom" className="max-h-[85svh] overflow-auto">
            {sheet ? (
              <>
                <SheetHeader>
                  <SheetTitle>{t.fareBreakdown}: {sheet.name}</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-4">
                  <FareLines lines={sheet.lines} totalPaise={sheet.totalPaise} advanceDuePaise={sheet.advanceDuePaise} notices={sheet.notices} lang={lang} />
                </div>
              </>
            ) : null}
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  if (step === "review" && chosen) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t.reviewTitle}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep("vehicles")}>{t.back}</Button>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4 text-sm">
            <p className="font-medium">{[s.pickup?.name, needsDrop ? s.drop?.name : null].filter(Boolean).join(" → ")}</p>
            <p className="text-muted-foreground">{t.tripWhen.replace("{when}", when(s.startAt))}</p>
            {s.tab === "round" ? <p className="text-muted-foreground">{t.returnLine.replace("{when}", when(s.returnAt))}</p> : null}
            <p className="text-muted-foreground">{t.passengersLine.replace("{pax}", String(s.pax)).replace("{bags}", String(s.bags))}</p>
            <p>{t.vehicle}: <span className="font-medium">{chosen.name}</span></p>
          </CardContent>
        </Card>
        <FareLines lines={chosen.lines} totalPaise={chosen.totalPaise} advanceDuePaise={chosen.advanceDuePaise} notices={chosen.notices} lang={lang} />
        <div className="flex flex-col gap-2">
          <label htmlFor="trip-notes" className="text-sm font-medium">{t.notesLabel}</label>
          <Textarea id="trip-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {loggedIn ? (
          <>
            <Button type="button" className="h-12 text-base" disabled={pending} onClick={book}>{pending ? t.requesting : t.requestBooking}</Button>
            <p className="text-xs text-muted-foreground">{t.requestHelp.replace("{operator}", operator)}</p>
          </>
        ) : (
          <>
            <a href={loginHref} onClick={rememberDraft} className={cn(buttonVariants(), "h-12 text-base")} data-testid="verify-to-book">{t.verifyToBook}</a>
            <p className="text-xs text-muted-foreground">{t.verifyHelp}</p>
          </>
        )}
      </div>
    )
  }

  if (step === "details") {
    return (
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t.tripDetails}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep("search")}>{t.changeSearch}</Button>
        </div>
        <p className="-mt-3 text-sm text-muted-foreground">{[s.pickup?.name, needsDrop ? s.drop?.name : null].filter(Boolean).join(" → ")}</p>
        <div className={cn("grid gap-3", s.tab === "round" ? "grid-cols-2" : "grid-cols-1")}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="start-at" className="text-sm font-medium">{t.when}</label>
            <Input id="start-at" type="datetime-local" className="h-11 min-w-0 max-w-full appearance-none text-base" min={minStart} value={s.startAt} onChange={(e) => setS({ ...s, startAt: e.target.value })} />
          </div>
          {s.tab === "round" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="return-at" className="text-sm font-medium">{t.returnWhen}</label>
              <Input id="return-at" type="datetime-local" className="h-11 min-w-0 max-w-full appearance-none text-base" min={s.startAt || minStart} value={s.returnAt} onChange={(e) => setS({ ...s, returnAt: e.target.value })} />
            </div>
          ) : null}
        </div>

        <div className="flex gap-8">
          <Stepper id="pax" label={t.passengers} value={s.pax} min={1} max={20} onChange={(n) => setS({ ...s, pax: n })} />
          <Stepper id="bags" label={t.bags} value={s.bags} min={0} max={20} onChange={(n) => setS({ ...s, bags: n })} />
        </div>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="h-12 rounded-xl text-base" disabled={pending}>{pending ? t.searching : t.seeFares}</Button>
      </form>
    )
  }

  const quickFor = showRecent ? null : needsDrop ? (!s.drop ? "drop" : !s.pickup ? "pickup" : null) : !s.pickup ? "pickup" : null

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        search()
      }}
    >
      <h1 className="sr-only">{greeting}</h1>

      <div className="flex flex-col gap-3">
        {/* The "Where to?" box is the destination whenever the trip has one; the pickup box sits under it. */}
        {needsDrop ? <PlaceField id="drop" label={t.drop} placeholder={greeting} value={s.drop} onChange={(p) => { const n = { ...s, drop: p }; setS(n); if (p) advanceIf(n) }} quick={quickFor === "drop" ? quick : []} quickHost={quickHost} lang={lang} here={here} /> : null}
        {/* Trips with a destination start with the one "Where to?" box; the pickup box appears once the destination is chosen. */}
        {!needsDrop || s.drop || s.pickup ? <PlaceField id="pickup" label={t.pickup} placeholder={needsDrop ? t.pickupPlaceholder : greeting} value={s.pickup} onChange={(p) => { const n = { ...s, pickup: p }; setS(n); if (p) advanceIf(n) }} quick={quickFor === "pickup" ? quick : []} quickHost={quickHost} lang={lang} here={here} /> : null}
      </div>

      {section === "rides" ? (
        <div role="tablist" aria-label={t.tripKind} className="flex justify-between">
          {([
            { key: "recent", label: t.tabRecent, icon: "recent" as const, on: showRecent, go: () => setShowRecent(true) },
            ...RIDE_TABS.map((k) => ({ key: k, label: { airport: t.tabAirport, oneway: t.tabOneWay, round: t.tabRound, local: t.tabLocal }[k], icon: k === "oneway" ? ("outstation" as const) : k === "round" ? ("round" as const) : k === "local" ? ("local" as const) : ("airport" as const), on: !showRecent && s.tab === k, go: () => (setShowRecent(false), setS({ ...s, tab: k })) })),
          ]).map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={c.on} data-testid={`tab-${c.key}`} onClick={c.go} className="flex w-11 flex-col items-center gap-1 text-[11px]">
              <span className={cn("flex size-11 items-center justify-center rounded-full transition-colors", c.on ? "bg-primary/15 text-primary" : "bg-muted text-foreground")}>
                <FilledIcon glyph={c.icon} className="size-5" />
              </span>
              <span className={cn("w-max whitespace-nowrap", c.on ? "font-semibold text-primary" : "text-muted-foreground")}>{c.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="-mt-3 text-sm text-muted-foreground">{t.vacationHint}</p>
      )}


      {showRecent ? (
        <div className="flex flex-col gap-3" data-testid="recent-rides">
          {loggedIn && recent.length === 0 ? null : <h2 className="text-sm font-semibold">{t.recentTitle}</h2>}
          {!loggedIn ? (
            <>
              <p className="text-sm text-muted-foreground">{t.recentSignIn}</p>
              <a href={`/api/t/auth/start?next=${encodeURIComponent("/")}&lang=${lang}`} className={cn(buttonVariants(), "h-11 rounded-xl")}>{t.signIn}</a>
            </>
          ) : recent.length === 0 ? (
            <EmptyState icon={HistoryIcon} title={t.recentEmptyTitle} description={t.recentEmpty} />
          ) : (
            <ul className="flex flex-col">
              {recent.map((r) => (
                <li key={r.id}>
                  <ListRow icon={HistoryIcon} title={r.route} subtitle={r.when} trailing={distanceLabel(here, r)} onClick={() => router.push(`/?repeat=${r.id}`)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div ref={setQuickHost} />

      {s.tab === "tour" ? (
        tours.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noTours}</p>
        ) : (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={t.tourPackage}>
            <span className="text-sm font-medium">{t.tourPackage}</span>
            {tours.map((p) => (
              <ListRow key={p.id} role="radio" aria-checked={s.packageId === p.id} icon={Route01Icon} title={p.name} subtitle={t.tourDays.replace("{n}", String(p.days))} selected={s.packageId === p.id} onClick={() => { const n = { ...s, packageId: p.id }; setS(n); advanceIf(n) }} />
            ))}
          </div>
        )
      ) : null}

      {s.tab === "local" ? (
        localPackages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noLocal}</p>
        ) : (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={t.localPackage}>
            <span className="text-sm font-medium">{t.localPackage}</span>
            <div className="flex flex-col">
              {localPackages.map((p) => {
                const v = `${p.hours}:${p.km}`
                return <ListRow key={v} role="radio" aria-checked={s.localPackage === v} icon={Clock01Icon} title={t.localPackageOption.replace("{hours}", String(p.hours)).replace("{km}", String(p.km))} selected={s.localPackage === v} onClick={() => { const n = { ...s, localPackage: v }; setS(n); advanceIf(n) }} />
              })}
            </div>
          </div>
        )
      ) : null}

    </form>
  )
}
