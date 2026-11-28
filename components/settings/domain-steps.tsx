"use client"

import { ArrowDown01Icon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export type StepState = "done" | "current" | "later"

/** One numbered step. Finished and current steps open and close; later ones stay shut until their turn. */
export function DomainStep({
  number,
  title,
  summary,
  state,
  busy,
  openable = state !== "later",
  open,
  onOpenChange,
  children,
}: {
  number: number
  title: string
  /** Shown under the title while the step is shut. */
  summary?: string
  state: StepState
  /** Tany is working on this step. */
  busy?: boolean
  openable?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <li className="border-b last:border-b-0" aria-current={state === "current" ? "step" : undefined}>
      <Collapsible open={open} onOpenChange={onOpenChange} disabled={!openable}>
        <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
              state === "done" && "border-primary bg-primary text-primary-foreground",
              state === "current" && "border-primary text-primary",
              state === "later" && "text-muted-foreground",
            )}
          >
            {busy ? (
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin motion-reduce:animate-none" />
            ) : state === "done" ? (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4" />
            ) : (
              number
            )}
          </span>
          <span className="grid min-w-0 flex-1">
            <span className={cn("font-medium", state === "later" && "text-muted-foreground")}>
              {title}
              {state === "done" ? <span className="sr-only"> (done)</span> : null}
            </span>
            {!open && summary ? <span className="truncate text-muted-foreground">{summary}</span> : null}
          </span>
          {openable ? (
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-4 pb-4 pl-0 sm:pl-10">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}
