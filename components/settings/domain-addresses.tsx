"use client"

import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import { SimpleTable } from "@/components/data-table/simple-table"
import { Badge } from "@/components/ui/badge"
import type { DomainStage } from "@/lib/domains/hostname"

export type AddressChoice = "default" | "custom"

/** The business's two web addresses, which one is the main one, and what can be done with each. */
export function DomainAddresses({
  hostname,
  defaultAddress,
  stage,
  disabled,
  canChooseCustom,
  onChoose,
  onRemove,
}: {
  hostname: string
  defaultAddress: string
  stage: DomainStage
  disabled: boolean
  /** The domain works and the plan includes it. */
  canChooseCustom: boolean
  onChoose: (choice: AddressChoice) => void
  onRemove: () => void
}) {
  const main: AddressChoice = stage === "live" ? "custom" : "default"
  const works = stage === "ready" || stage === "live"
  // While an interrupted domain is still set as main, choosing the Tany address is what clears that.
  const chosen: AddressChoice = stage === "live" || stage === "interrupted" ? "custom" : "default"

  const mainSubmenu = {
    label: "Main address",
    value: chosen,
    disabled: disabled || (!canChooseCustom && chosen === "default"),
    options: [
      { value: "default", label: "Tany address" },
      ...(canChooseCustom || chosen === "custom" ? [{ value: "custom", label: "Your domain" }] : []),
    ],
    onSelect: (value: string) => onChoose(value === "custom" ? "custom" : "default"),
  }

  const status = (isMain: boolean, isCustom: boolean) => {
    if (isCustom && stage === "interrupted") return <Badge variant="destructive">Not working</Badge>
    if (isMain) return <Badge>Main</Badge>
    if (isCustom && !works) return <Badge variant="outline">Setting up</Badge>
    return <Badge variant="outline">Working</Badge>
  }

  return (
    <SimpleTable
      searchPlaceholder="Search addresses..."
      columns={[{ title: "Address" }, { title: "Status" }, { title: "" }]}
      rows={[
        {
          id: "custom",
          cells: [
            <span key="a" className="break-all">{hostname}</span>,
            <span key="s">{status(main === "custom", true)}</span>,
            <DataTableRowActions
              key="m"
              label={`Actions for ${hostname}`}
              actions={[
                works && { label: "View", onClick: () => window.open(`https://${hostname}`, "_blank", "noopener,noreferrer") },
                mainSubmenu,
                {
                  label: "Remove",
                  destructive: true,
                  disabled,
                  onClick: onRemove,
                  confirm: { title: `Remove ${hostname}?`, description: `Your site stops working on this domain straight away and stays available at ${defaultAddress}. Links using ${hostname} will stop working.` },
                },
              ]}
            />,
          ],
        },
        {
          id: "default",
          cells: [
            <span key="a" className="break-all">{defaultAddress}</span>,
            <span key="s">{status(main === "default", false)}</span>,
            <DataTableRowActions
              key="m"
              label={`Actions for ${defaultAddress}`}
              // While the domain is the main address this one forwards to it, so there is nothing separate to view.
              actions={[main === "default" && { label: "View", onClick: () => window.open(`https://${defaultAddress}`, "_blank", "noopener,noreferrer") }, mainSubmenu]}
            />,
          ],
        },
      ]}
    />
  )
}
