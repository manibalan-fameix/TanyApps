"use client"

import { Copy01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

import { SimpleTable } from "@/components/data-table/simple-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type SetupGuide, setupInstructions } from "@/lib/domains/hostname"
import { toast } from "@/lib/toast"

export type RecordState = "waiting" | "found" | "missing"

const STATES: Record<RecordState, { label: string; variant: "outline" | "destructive" }> = {
  waiting: { label: "Not found yet", variant: "outline" },
  found: { label: "Found", variant: "outline" },
  missing: { label: "Missing", variant: "destructive" },
}

const copy = async (value: string, done = "Copied.") => {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(done)
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.")
  }
}

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono break-all">{value}</span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Copy ${label}`} onClick={() => copy(value)}>
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
      </Button>
    </span>
  )
}

const Steps = ({ items }: { items: string[] }) => (
  <ol className="grid list-decimal gap-1 pl-5">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ol>
)

/** The record to add, and short directions for adding it. */
export function DomainRecords({ guide, backup, state }: { guide: SetupGuide; backup: { name: string; value: string } | null; state: RecordState }) {
  const { host, domain, name } = guide
  const [extra, setExtra] = useState(false)
  const status = STATES[state]
  const forward = guide.forward ? [`So that ${domain} works too, forward it to https://${host}.`] : []

  const rows = [
    {
      id: "cname",
      cells: ["CNAME", <Copyable key="n" label="name" value={name} />, <Copyable key="v" label="value" value={guide.value} />, <Badge key="s" variant={status.variant}>{status.label}</Badge>],
    },
    ...(extra && backup
      ? [
          {
            id: "txt",
            cells: ["TXT", <Copyable key="n" label="TXT name" value={backup.name} />, <Copyable key="v" label="TXT value" value={backup.value} />, <Badge key="s" variant="outline">Extra</Badge>],
          },
        ]
      : []),
  ]

  return (
    <div className="grid min-w-0 gap-4">
      <Tabs defaultValue="godaddy">
        <TabsList>
          <TabsTrigger value="godaddy">GoDaddy</TabsTrigger>
          <TabsTrigger value="other">Other providers</TabsTrigger>
        </TabsList>
        <TabsContent value="godaddy" className="pt-2">
          <Steps items={[`In GoDaddy, open ${domain}, then DNS.`, `Edit the CNAME named ${name}. If there is none, add it.`, "Copy the value below into it and save.", ...forward]} />
        </TabsContent>
        <TabsContent value="other" className="pt-2">
          <Steps items={[`Open the DNS settings for ${domain}.`, `Add a CNAME named ${name}. If one exists, edit it.`, "Copy the value below into it and save.", ...forward]} />
        </TabsContent>
      </Tabs>

      <SimpleTable
        columns={[{ title: "Type" }, { title: "Name" }, { title: "Value", className: "min-w-52" }, { title: "Status" }]}
        rows={rows}
        searchPlaceholder="Search records..."
      />

      <p className="text-muted-foreground">Leave your other records as they are, especially email records.</p>

      {backup && state !== "found" ? (
        <Button type="button" variant="link" className="h-auto justify-self-start p-0" aria-expanded={extra} onClick={() => setExtra((v) => !v)}>
          {extra ? "Hide the extra record" : "Added it, but still not found?"}
        </Button>
      ) : null}
      {extra ? <p className="text-muted-foreground">Some providers hide CNAME records. Keep the first record and also add the TXT record in the table.</p> : null}
    </div>
  )
}

/** Ways to hand the job to whoever looks after the domain. */
export function DomainHelp({ guide, helpPhone }: { guide: SetupGuide; helpPhone: string }) {
  const message = setupInstructions(guide)
  const open = (to: string, text: string) => window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" />}>Get help</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => copy(message, "Instructions copied.")}>Copy instructions</DropdownMenuItem>
        <DropdownMenuItem onClick={() => open("", message)}>Send on WhatsApp</DropdownMenuItem>
        <DropdownMenuItem onClick={() => open(helpPhone, `I need help connecting my domain.\n\n${message}`)}>Ask Tany for help</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
