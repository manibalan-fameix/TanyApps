"use client"

import { Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import {
  addCustomDomain,
  autoCheckCustomDomain,
  checkCustomDomain,
  makeCustomDomainPrimary,
  removeCustomDomain,
  switchToDefaultAddress,
} from "@/app/(admin)/(shell)/settings/domain/actions"
import { type AddressChoice, DomainAddresses } from "@/components/settings/domain-addresses"
import { DomainHelp, DomainRecords, type RecordState } from "@/components/settings/domain-guide"
import { DomainStep, type StepState } from "@/components/settings/domain-steps"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { type DomainStage, type SetupGuide, parseCustomHostname } from "@/lib/domains/hostname"
import type { DomainResult } from "@/lib/tenant/domains"
import { toast } from "@/lib/toast"

export type DomainView = {
  hostname: string
  stage: DomainStage
  lastChecked: string | null
  guide: SetupGuide
  backup: { name: string; value: string } | null
}

/** While the owner waits: how often the open page checks, and for how long. The scheduled job carries on after that. */
const AUTO_CHECK_SECONDS = 30
const AUTO_CHECK_FOR_MS = 20 * 60_000

type StepNumber = 1 | 2 | 3 | 4

/** Where each stage leaves the owner: the step to work on, and how many are finished. */
const PROGRESS: Record<DomainStage, { current: StepNumber; done: number }> = {
  pending_dns: { current: 2, done: 1 },
  securing: { current: 3, done: 2 },
  ready: { current: 4, done: 3 },
  live: { current: 4, done: 4 },
  interrupted: { current: 2, done: 1 },
}

const RECORD_STATE: Record<DomainStage, RecordState> = { pending_dns: "waiting", securing: "found", ready: "found", live: "found", interrupted: "missing" }

function Check({ done, busy, children }: { done: boolean; busy: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {done ? (
        <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4 text-primary" />
      ) : busy ? (
        <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
      ) : (
        <span aria-hidden className="mx-1 size-2 rounded-full border border-muted-foreground" />
      )}
      <span className={done ? undefined : "text-muted-foreground"}>
        {children}
        <span className="sr-only">{done ? " (done)" : " (waiting)"}</span>
      </span>
    </li>
  )
}

export function DomainPanel({ domain, defaultAddress, canEdit, canUse, switchWarning, helpPhone }: { domain: DomainView | null; defaultAddress: string; canEdit: boolean; canUse: boolean; switchWarning?: string; helpPhone: string }) {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  const [askingMain, setAskingMain] = useState(false)
  const stage = domain?.stage ?? null
  const progress = stage ? PROGRESS[stage] : { current: 1 as StepNumber, done: 0 }

  // The step the owner opened or shut by hand. It is forgotten when the stage moves on, so the next step opens by itself.
  const key = stage ?? "none"
  const [chosen, setChosen] = useState<{ at: string; step: StepNumber | null }>({ at: key, step: progress.current })
  const openStep = chosen.at === key ? chosen.step : progress.current
  const toggle = (step: StepNumber) => (open: boolean) => setChosen({ at: key, step: open ? step : null })

  const run = (step: () => Promise<DomainResult>, done?: string) =>
    start(async () => {
      const res = await step()
      if (res.ok) {
        setError("")
        setFound("")
        const message = res.note ?? done
        if (message) toast.success(message)
      } else setError(res.error)
      router.refresh()
    })

  // What the latest automatic check found, for example a record that points to the wrong place.
  const [found, setFound] = useState("")
  const [nextIn, setNextIn] = useState(AUTO_CHECK_SECONDS)
  const [paused, setPaused] = useState(false)
  const waiting = canEdit && canUse && (stage === "pending_dns" || stage === "securing")
  useEffect(() => {
    if (!waiting) return
    const started = Date.now()
    let left = AUTO_CHECK_SECONDS
    let busy = false
    const timer = setInterval(async () => {
      if (Date.now() - started > AUTO_CHECK_FOR_MS) {
        setPaused(true)
        return clearInterval(timer)
      }
      if (busy || document.visibilityState !== "visible") return
      setPaused(false)
      left -= 1
      setNextIn(left)
      if (left > 0) return
      busy = true
      try {
        const res = await autoCheckCustomDomain()
        // The newest answer replaces whatever an earlier check said.
        setError("")
        setFound(res.ok ? (res.note ?? "") : res.error)
        router.refresh()
      } catch {
        // A dropped connection: the next turn tries again.
      } finally {
        busy = false
        left = AUTO_CHECK_SECONDS
        setNextIn(left)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [waiting, router])

  const errorLine = error ? (
    <p role="alert" className="text-destructive">
      {error}
    </p>
  ) : null

  const choose = (choice: AddressChoice) => {
    if (choice === "custom") setAskingMain(true)
    else run(switchToDefaultAddress, `${defaultAddress} is your main address again.`)
  }

  const addresses = domain ? (
    <DomainAddresses
      hostname={domain.hostname}
      defaultAddress={defaultAddress}
      stage={domain.stage}
      disabled={!canEdit || pending}
      canChooseCustom={canUse && domain.stage === "ready"}
      onChoose={choose}
      onRemove={() => run(removeCustomDomain, "Domain removed.")}
    />
  ) : null

  // Without the plan there is nothing to set up: only what is connected, so it can be switched or removed.
  if (!canUse) {
    return domain ? (
      <div className="grid gap-3">
        {addresses}
        {errorLine}
      </div>
    ) : null
  }

  const stateOf = (step: StepNumber): StepState => (step <= progress.done ? "done" : step === progress.current ? "current" : "later")
  const checking = waiting && !paused
  const checkLine = domain ? (
    <p role="status" className="text-muted-foreground">
      {found ? `${found} ` : ""}
      {pending ? "Checking now..." : checking ? `Next check in ${nextIn}s.` : waiting ? "Automatic checks have paused. We still check in the background." : ""}
      {domain.lastChecked ? ` Last checked ${domain.lastChecked}.` : ""}
    </p>
  ) : null
  const checkButton = (label: string) => (
    <Button type="button" disabled={!canEdit || pending} onClick={() => run(checkCustomDomain)}>
      {pending ? "Checking..." : label}
    </Button>
  )
  // Shown before adding, so "mybusiness.com" becoming "www.mybusiness.com" is never a surprise.
  const preview = parseCustomHostname(input)

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-2">
        <p className="text-muted-foreground">{progress.done === 4 ? "All 4 steps done" : `Step ${progress.current} of 4`}</p>
        <Progress value={progress.done * 25} aria-label="Domain setup progress" className="[&_[data-slot=progress-track]]:h-1.5" />
      </div>

      {stage === "interrupted" ? (
        <Alert variant="destructive">
          <AlertTitle>Your domain stopped working</AlertTitle>
          <AlertDescription>Visitors are using {defaultAddress}. Restore the record in step 2. Your domain switches back by itself once it works.</AlertDescription>
        </Alert>
      ) : null}

      <ol>
        <DomainStep number={1} title="Enter your domain" summary={domain?.hostname} state={stateOf(1)} open={openStep === 1} onOpenChange={toggle(1)}>
          {domain ? (
            <p>
              You are connecting <span className="font-medium break-all">{domain.hostname}</span>. To use a different domain, remove this one first.
            </p>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                run(() => addCustomDomain(input), "Domain added. Now add one DNS record.")
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="custom-domain">A domain you have already bought</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="custom-domain"
                    placeholder="yourbusiness.com"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={!canEdit || pending}
                    required
                  />
                  <Button type="submit" disabled={!canEdit || pending || !preview.ok}>
                    {pending ? "Adding..." : "Continue"}
                  </Button>
                </div>
                <p className="text-muted-foreground" aria-live="polite">
                  {preview.ok ? (
                    <>
                      We will connect <span className="font-medium text-foreground">{preview.hostname}</span>.
                    </>
                  ) : (
                    <>Your site is at {defaultAddress} today.</>
                  )}
                </p>
              </div>
              {errorLine}
            </form>
          )}
        </DomainStep>

        <DomainStep number={2} title="Add the DNS record" summary={stage && stateOf(2) === "done" ? "Record found" : undefined} state={stateOf(2)} open={openStep === 2} onOpenChange={toggle(2)}>
          {domain ? (
            <>
              <DomainRecords guide={domain.guide} backup={domain.backup} state={RECORD_STATE[domain.stage]} />
              {stateOf(2) === "current" ? (
                <>
                  {checkLine}
                  {errorLine}
                  <div className="flex flex-wrap gap-2">
                    {checkButton("I've added it, check now")}
                    <DomainHelp guide={domain.guide} helpPhone={helpPhone} />
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </DomainStep>

        <DomainStep
          number={3}
          title="We connect it"
          summary={stateOf(3) === "done" ? "Secure connection ready" : undefined}
          state={stateOf(3)}
          busy={stage === "securing" && checking}
          open={openStep === 3}
          onOpenChange={toggle(3)}
        >
          <ul className="grid gap-2">
            <Check done={progress.done >= 2} busy={false}>
              Record found
            </Check>
            <Check done={progress.done >= 3} busy={stage === "securing" && checking}>
              Security certificate ready
            </Check>
          </ul>
          {stage === "securing" ? (
            <>
              <p className="text-muted-foreground">This usually takes a few minutes. Keep the record in place. You can leave this page and come back.</p>
              {checkLine}
              {errorLine}
              <div>{checkButton("Check now")}</div>
            </>
          ) : null}
        </DomainStep>

        <DomainStep
          number={4}
          title="Go live"
          summary={stage === "live" ? "Your domain is the main address" : undefined}
          state={stateOf(4)}
          openable={stateOf(4) !== "later" || stage === "interrupted"}
          open={openStep === 4}
          onOpenChange={toggle(4)}
        >
          {domain ? (
            <>
              {stage === "ready" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" disabled={!canEdit || pending} onClick={() => setAskingMain(true)}>
                    Make main address
                  </Button>
                  <p className="text-muted-foreground">Your domain works. Open it first if you want to check it.</p>
                </div>
              ) : null}
              {addresses}
              {domain.guide.forward && (stage === "ready" || stage === "live") ? (
                <p className="text-muted-foreground">
                  To make {domain.guide.domain} work without www, forward it to https://{domain.guide.host} at your domain provider.
                </p>
              ) : null}
              {errorLine}
            </>
          ) : null}
        </DomainStep>
      </ol>

      {/* Once the address table is there, Remove is in its row menu. */}
      {domain && (stage === "pending_dns" || stage === "securing") ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" className="justify-self-start text-muted-foreground" disabled={!canEdit || pending} />}>Remove domain</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {domain.hostname}?</AlertDialogTitle>
              <AlertDialogDescription>
                Setup stops and your site stays at {defaultAddress}. If you already changed your DNS record, change it back too.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => run(removeCustomDomain, "Domain removed.")}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {domain ? (
        <AlertDialog open={askingMain} onOpenChange={setAskingMain}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Use {domain.hostname} as your main address?</AlertDialogTitle>
              <AlertDialogDescription>
                Visitors to {defaultAddress} will be sent to {domain.hostname}. Links you have already shared keep working. {switchWarning}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setAskingMain(false)
                  run(makeCustomDomainPrimary, "Your main address has changed. It can take a minute to apply everywhere.")
                }}
              >
                Confirm change
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
