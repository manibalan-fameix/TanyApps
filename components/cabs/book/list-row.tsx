import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/** One line of a list on the booking sheet: a round icon, a title and a muted subtitle (cut off with an ellipsis when long), and an optional note on the right such as the distance. */
export function ListRow({ icon, title, subtitle, trailing, selected, className, ...props }: { icon: IconSvgElement; title: string; subtitle?: string | null; trailing?: string | null; selected?: boolean } & Omit<React.ComponentProps<"button">, "title">) {
  return (
    <button type="button" className={cn("flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-muted", selected && "bg-primary/10", className)} {...props}>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", selected ? "bg-primary/15 text-primary" : "bg-muted text-foreground")}>
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
      </span>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{title}</span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-xs text-muted-foreground">{trailing}</span> : null}
    </button>
  )
}
