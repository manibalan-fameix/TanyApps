"use client"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** The search box at the left of a table's toolbar. */
export function DataTableSearch({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return <Input type="search" aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn("h-8 w-full rounded-md border-border bg-background sm:w-52", className)} />
}
