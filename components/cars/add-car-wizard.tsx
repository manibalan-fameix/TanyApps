"use client"

import Link from "next/link"
import { useCallback, useState } from "react"

import { getCarStateAction } from "@/app/(admin)/(shell)/cars/actions"
import { Confetti } from "@/components/cars/confetti"
import { DetailsStep } from "@/components/cars/details-step"
import { MarketplaceDetailsStep } from "@/components/cars/marketplace-details-step"
import { PhotosStep } from "@/components/cars/photos-step"
import { PlateStep } from "@/components/cars/plate-step"
import { PriceStep } from "@/components/cars/price-step"
import { ShareKitPanel } from "@/components/cars/share-kit-panel"
import { StartStep } from "@/components/cars/start-step"
import { VideoStep } from "@/components/cars/video-step"
import {
  VoiceStep,
  voiceCopy,
  type VoiceLang,
} from "@/components/cars/voice-step"
import { WizardShell } from "@/components/cars/wizard-shell"
import type { Step } from "@/components/cars/stepper"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { RcSummary } from "@/lib/cars/dto"
import type { ShareKit } from "@/lib/cars/publish"
import type { CarState } from "@/lib/cars/state"
import { copy } from "@/lib/copy"
import type { RcErrorCode } from "@/lib/rc/types"
import { cn } from "@/lib/utils"

const t = copy.admin.addCar
const ORDER = ["plate", "car", "photos", "marketplace", "price"] as const

const HEADINGS: Record<
  Exclude<Step, "start" | "video" | "voice" | "done">,
  { title: string; subtitle: string }
> = {
  plate: { title: t.plate.title, subtitle: t.plate.body },
  car: { title: t.details.title, subtitle: t.carSubtitle },
  photos: { title: t.photos.title, subtitle: t.photos.body },
  marketplace: { title: t.marketplace.title, subtitle: t.marketplace.body },
  price: { title: t.price.title, subtitle: t.price.body },
}

function deriveStep(
  car: CarState | null,
  requested?: Step,
  voiceAllowed = true
): Step {
  // Plans without voice entry never land on the voice page, even from an old link or a saved session.
  if (!voiceAllowed && requested === "voice") requested = undefined
  if (!voiceAllowed && car?.voiceDraft && !car.voiceDraft.done)
    return car.variant ? "photos" : "car"
  // A car started by voice and not yet moved on to photos: back to the voice page, where the dealer left off.
  if (
    car?.voiceDraft &&
    !car.voiceDraft.done &&
    (!requested || requested === "voice")
  )
    return "voice"
  if (!car) return requested === "plate" ? "plate" : "start"
  // A live car lands on the share screen unless the dealer explicitly asked to edit a step.
  if (car.status === "live" && (!requested || requested === "plate"))
    return "done"
  if (requested && requested !== "plate")
    return car.variant || requested === "car" ? requested : "car"
  return car.variant ? "photos" : "car"
}

/** The whole add-a-car flow. Resumable: pass an existing draft and it lands on the right step. */
export function AddCarWizard({
  initialCar,
  initialKit,
  initialStep,
  dealer,
  voiceAllowed,
}: {
  initialCar: CarState | null
  initialKit: ShareKit | null
  initialStep?: Step
  dealer: { name: string; logoUrl: string | null }
  /** The plan includes adding a car by voice (Growth and above). */
  voiceAllowed: boolean
}) {
  const [car, setCar] = useState<CarState | null>(initialCar)
  const [step, setStep] = useState<Step>(() =>
    deriveStep(initialCar, initialStep, voiceAllowed)
  )
  const [rc, setRc] = useState<RcSummary | null>(null)
  const [rcError, setRcError] = useState<RcErrorCode | null>(null)
  const [hint, setHint] = useState<string | undefined>()
  const [fromVideo, setFromVideo] = useState(false)
  const [fromVoice, setFromVoice] = useState(false)
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(
    initialCar?.voiceDraft?.lang ?? "en"
  )
  const [kit, setKit] = useState<ShareKit | null>(initialKit)
  // Confetti only for a car published in this session, not when reopening an already-live one.
  const [celebrate, setCelebrate] = useState(false)

  const go = useCallback((s: Step) => {
    setStep(s)
    window.scrollTo({ top: 0 })
  }, [])

  async function onStarted(r: {
    carId: string
    rc: RcSummary | null
    rcError: RcErrorCode | null
  }) {
    const res = await getCarStateAction(r.carId)
    if (!res.ok) return
    setCar(res.car)
    setRc(r.rc)
    setRcError(r.rcError)
    // Keep the URL resumable without a server round trip.
    window.history.replaceState(null, "", `/cars/new?car=${r.carId}`)
    go("car")
  }

  async function onVideoRead(r: { carId: string; hint: string }) {
    const res = await getCarStateAction(r.carId)
    if (!res.ok) return
    setCar(res.car)
    setHint(r.hint)
    setFromVideo(true)
    window.history.replaceState(null, "", `/cars/new?car=${r.carId}`)
    go("car")
  }

  async function onVoiceCreated(r: { carId: string; hint: string }) {
    const res = await getCarStateAction(r.carId)
    if (!res.ok) return
    setCar(res.car)
    setHint(r.hint)
    setFromVoice(true)
    window.history.replaceState(null, "", `/cars/new?car=${r.carId}`)
    // Photos next, then the (already filled) marketplace details, then price and publish.
    // Only when the model could not be told from what was said do we stop to pick it: a car cannot be published without one.
    go(res.car.variant ? "photos" : "car")
  }

  const heading =
    step === "start"
      ? { title: t.start.title, subtitle: t.start.subtitle }
      : step === "voice"
        ? {
            title: voiceCopy(voiceLang).title,
            subtitle: voiceCopy(voiceLang).body,
          }
        : step === "video"
          ? { title: t.video.title, subtitle: t.video.body }
          : step === "done"
            ? { title: t.done.title, subtitle: car?.variant?.label }
            : HEADINGS[step]
  const back: Partial<Record<Step, Step>> = {
    plate: "start",
    video: "start",
    voice: "start",
    photos: "car",
    marketplace: "photos",
    price: "marketplace",
  }
  const backTo = back[step]

  return (
    <WizardShell
      dealer={dealer}
      title={heading.title}
      subtitle={heading.subtitle}
      segments={
        step === "start" ||
        step === "video" ||
        step === "voice" ||
        step === "done"
          ? undefined
          : ORDER.length
      }
      active={
        step === "start" ||
        step === "video" ||
        step === "voice" ||
        step === "done"
          ? undefined
          : ORDER.indexOf(step) + 1
      }
      onBack={backTo ? () => go(backTo) : undefined}
      wide={step === "done" || step === "voice"}
      hideHeading={step === "done" || step === "voice"}
      noFooter={step === "voice"}
      headerTitle={
        step === "voice" ? voiceCopy(voiceLang).headerTitle : undefined
      }
    >
      {step === "start" && (
        <StartStep
          onNew={() => go("plate")}
          onVideo={() => go("video")}
          onVoice={() => go("voice")}
          voiceLocked={!voiceAllowed}
        />
      )}

      {step === "voice" && (
        <VoiceStep
          lang={voiceLang}
          onLangChange={setVoiceLang}
          onCreated={onVoiceCreated}
          initial={
            initialCar?.voiceDraft && !initialCar.voiceDraft.done
              ? { carId: initialCar.id, values: initialCar.voiceDraft.values }
              : undefined
          }
        />
      )}

      {step === "video" && <VideoStep onRead={onVideoRead} />}

      {(fromVideo || fromVoice) &&
        step !== "start" &&
        step !== "video" &&
        step !== "voice" &&
        step !== "done" && (
          <p
            className="mb-3 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground"
            data-testid="from-video-note"
          >
            {fromVoice ? voiceCopy(voiceLang).review : t.video.review}
          </p>
        )}

      {step === "plate" && <PlateStep onStarted={onStarted} />}

      {step === "car" && car && (
        <DetailsStep
          car={car}
          rc={rc}
          rcError={rcError}
          hint={hint}
          onCarChange={setCar}
          onNext={() => go("photos")}
        />
      )}

      {step === "photos" && car && (
        <PhotosStep
          car={car}
          onCarChange={setCar}
          onNext={() => go("marketplace")}
        />
      )}

      {step === "marketplace" && car && (
        <MarketplaceDetailsStep
          car={car}
          onCarChange={setCar}
          onNext={() => go("price")}
        />
      )}

      {step === "price" && car && (
        <PriceStep
          car={car}
          onCarChange={setCar}
          onPublished={(k, c) => {
            setKit(k)
            setCar(c)
            setCelebrate(true)
            go("done")
          }}
        />
      )}

      {step === "done" && car && (
        <>
          {celebrate && <Confetti />}
          <span className="sr-only" data-testid="published-title">
            {t.done.title}
          </span>
          {kit ? (
            <ShareKitPanel
              kit={kit}
              title={car.variant?.label}
              aside={
                <Card>
                  <CardContent className="flex flex-col gap-2">
                    {kit && (
                      <a
                        href={kit.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          buttonVariants({ variant: "outline" }),
                          "w-full"
                        )}
                      >
                        {t.done.open}
                      </a>
                    )}
                    {/* Hard navigation on purpose: it guarantees a fresh wizard (the URL was rewritten in place). */}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        window.location.assign(
                          new URL("/cars/new", window.location.origin).href
                        )
                      }
                    >
                      {t.done.another}
                    </Button>
                    <Link
                      href="/cars"
                      className={cn(
                        buttonVariants({ variant: "ghost" }),
                        "w-full"
                      )}
                    >
                      {t.done.allCars}
                    </Link>
                  </CardContent>
                </Card>
              }
            />
          ) : null}
        </>
      )}
    </WizardShell>
  )
}
