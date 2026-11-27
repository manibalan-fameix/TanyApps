"use client"

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
import { DomainGuide } from "@/components/settings/domain-guide"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
const AUTO_CHECK_MS = 30_000
const AUTO_CHECK_FOR_MS = 20 * 60_000

const STAGES: Record<DomainStage, { badge: string; tone: "default" | "secondary" | "destructive"; text: string }> = {
  pending_dns: { badge: "Waiting for DNS", tone: "secondary", text: "Add the record below where you bought your domain. We check for it automatically." },
  securing: { badge: "Setting up", tone: "secondary", text: "We found your record. The security certificate is being set up. Keep the record in place." },
  ready: { badge: "Ready", tone: "secondary", text: "Your domain works. Confirm to make it your main address." },
  live: { badge: "Main address", tone: "default", text: "This is your shop's main address." },
  interrupted: {
    badge: "Not working",
    tone: "destructive",
    text: "Your domain stopped pointing to Tany, so visitors are using your Tany address. Restore the CNAME record, then check. It switches back by itself once it works.",
  },
}

export function DomainPanel({ domain, defaultAddress, canEdit, canUse, switchWarning, helpPhone }: { domain: DomainView | null; defaultAddress: string; canEdit: boolean; canUse: boolean; switchWarning?: string; helpPhone: string }) {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  const run = (step: () => Promise<DomainResult>, done?: string) =>
    start(async () => {
      const res = await step()
      if (res.ok) {
        setError("")
        const message = res.note ?? done
        if (message) toast.success(message)
      } else setError(res.error)
      router.refresh()
    })

  // What the latest automatic check found, for example a record that points to the wrong place.
  const [found, setFound] = useState("")
  const waiting = canEdit && canUse && (domain?.stage === "pending_dns" || domain?.stage === "securing")
  useEffect(() => {
    if (!waiting) return
    const started = Date.now()
    let busy = false
    const timer = setInterval(async () => {
      if (Date.now() - started > AUTO_CHECK_FOR_MS) return clearInterval(timer)
      if (busy || document.visibilityState !== "visible") return
      busy = true
      try {
        const res = await autoCheckCustomDomain()
        setFound(res.ok ? (res.note ?? "") : res.error)
        router.refresh()
      } catch {
        // A dropped connection: the next turn tries again.
      } finally {
        busy = false
      }
    }, AUTO_CHECK_MS)
    return () => clearInterval(timer)
  }, [waiting, router])

  const errorLine = error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null

  if (!domain) {
    if (!canUse) return null
    // Shown before adding, so "myshop.com" becoming "www.myshop.com" is never a surprise.
    const preview = parseCustomHostname(input)
    return (
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => addCustomDomain(input), "Domain added. Now add one DNS record.")
        }}
      >
        <p className="text-sm text-muted-foreground">
          Your shop is at <span className="font-medium text-foreground">{defaultAddress}</span>. You need a domain you have already bought.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="custom-domain">Your domain</Label>
          <Input
            id="custom-domain"
            placeholder="yourshop.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!canEdit || pending}
            required
          />
          {preview.ok ? (
            <p className="text-sm text-muted-foreground">
              We will connect <span className="font-medium text-foreground">{preview.hostname}</span>.
            </p>
          ) : null}
        </div>
        {errorLine}
        <Button type="submit" className="justify-self-start" disabled={!canEdit || pending}>
          {pending ? "Adding..." : "Add domain"}
        </Button>
      </form>
    )
  }

  const stage = STAGES[domain.stage]
  const working = domain.stage === "ready" || domain.stage === "live"
  const isMain = domain.stage === "live" || domain.stage === "interrupted"

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-all">{domain.hostname}</span>
          <Badge variant={stage.tone}>{stage.badge}</Badge>
        </div>
        {canUse ? <p className="text-sm text-muted-foreground">{stage.text}</p> : null}
        {domain.lastChecked ? <p className="text-sm text-muted-foreground">Last checked {domain.lastChecked}</p> : null}
      </div>

      {/* The setup steps go once it works, and forwarding is the one that connecting does not prove was done. */}
      {canUse && working && domain.guide.forward ? (
        <p className="text-sm text-muted-foreground">
          So that {domain.guide.domain} works without www too, set your domain provider to forward it to https://{domain.guide.host}.
        </p>
      ) : null}

      {waiting ? (
        <p role="status" className="text-sm text-muted-foreground">
          {found || "Checking every 30 seconds while this page is open. You can also leave and come back later."}
        </p>
      ) : null}

      {canUse && !working ? <DomainGuide guide={domain.guide} backup={domain.backup} helpPhone={helpPhone} /> : null}

      {errorLine}

      <div className="flex flex-wrap gap-2">
        {canUse && !working ? (
          <Button type="button" variant="outline" disabled={!canEdit || pending} onClick={() => run(checkCustomDomain)}>
            {pending ? "Checking..." : "Check now"}
          </Button>
        ) : null}

        {canUse && domain.stage === "ready" ? (
          <AlertDialog>
            <AlertDialogTrigger render={<Button disabled={!canEdit || pending} />}>Make main address</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Use {domain.hostname} as your main address?</AlertDialogTitle>
                <AlertDialogDescription>
                  Visitors to {defaultAddress} will be sent to {domain.hostname}. Links you have already shared keep working. {switchWarning}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(makeCustomDomainPrimary, "Your main address has changed. It can take a minute to apply everywhere.")}>
                  Confirm change
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}

        {isMain ? (
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || pending}
            onClick={() => run(switchToDefaultAddress, `${defaultAddress} is your main address again.`)}
          >
            Use {defaultAddress} instead
          </Button>
        ) : null}

        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" disabled={!canEdit || pending} />}>Remove domain</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {domain.hostname}?</AlertDialogTitle>
              <AlertDialogDescription>
                Your shop stops working on this domain straight away and stays available at {defaultAddress}. Links using {domain.hostname} will
                stop working.
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
      </div>
    </div>
  )
}
