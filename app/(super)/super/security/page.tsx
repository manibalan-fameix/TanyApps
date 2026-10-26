import { PageHeader } from "@/components/restaurant/page-header"
import { ListCard } from "@/components/super/metrics"
import { fmtDateTime } from "@/lib/super/format"
import { loadSecurityEvents } from "@/lib/super/queries"

export const metadata = { title: "Security trail" }
export const dynamic = "force-dynamic"

// Read-only view of the platform security trail (privileged actions, exports, invitations, role changes). The trail itself is
// append-only in the database; this page cannot change it. Filters: ?action=super.export&outcome=denied&business=<id>&actor=<email or id>
export default async function SecurityTrailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const events = await loadSecurityEvents({ action: q.action, outcome: q.outcome, businessId: q.business, actor: q.actor, limit: 200 })
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Security trail" description="Who did what that matters: Tany team sign-ins and exports, payment exception resolutions, staff invitations and removals, new businesses. Newest first." />
      <ListCard
        title={`Latest ${events.length} event${events.length === 1 ? "" : "s"}`}
        hint="Filter with ?action=, ?outcome=denied, ?business= and ?actor="
        empty="Nothing recorded yet."
        rows={events.map((e) => ({
          key: e.id,
          primary: `${e.action} · ${e.outcome}`,
          secondary: `${e.actorLabel ?? e.actorId ?? e.actorType}${e.businessId ? ` · business ${e.businessId.slice(0, 8)}` : ""} · ${e.targetType}${e.targetId ? ` ${e.targetId.slice(0, 12)}` : ""}${e.requestId ? ` · ${e.requestId}` : ""}`,
          right: fmtDateTime(e.at.toISOString()),
        }))}
      />
    </div>
  )
}
