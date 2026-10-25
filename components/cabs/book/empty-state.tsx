import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

/** "Nothing here yet": a raised icon tile with a title and one line of text, centred. */
export function EmptyState({ icon, title, description }: { icon: IconSvgElement; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="empty-state">
      <div className="grid size-16 place-items-center rounded-2xl bg-linear-to-b from-primary/80 to-primary text-primary-foreground shadow-lg ring-8 ring-primary/10">
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-7" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-primary">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
