import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { SettingsPage } from "@/components/settings/settings-page"
import { AddTeammate, RemoveTeammate, ResetPassword } from "@/components/settings/team-actions"
import { Badge } from "@/components/ui/badge"
import { getDealerContext } from "@/lib/auth/context"
import { unscopedDb } from "@/lib/db/client"
import { dealerUsers, users } from "@/lib/db/schema"

export const metadata = { title: "Team" }

export default async function TeamPage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")
  const members = ctx.dealerInDb
    ? await unscopedDb
        .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: dealerUsers.role })
        .from(dealerUsers)
        .innerJoin(users, eq(users.id, dealerUsers.userId))
        .where(eq(dealerUsers.dealerId, ctx.dealer.id))
    : [{ id: ctx.user.id, name: ctx.user.name ?? null, email: ctx.user.email ?? null, phone: null, role: ctx.role }]

  const canManage = ctx.role === "owner" && ctx.dealerInDb
  return (
    <SettingsPage title="Team" description="People who can sign in to this dealership." action={canManage ? <AddTeammate /> : undefined}>
      <ul className="divide-y">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.name || m.email || m.phone || "Unnamed"}</p>
              {m.email || m.phone ? <p className="truncate text-sm text-muted-foreground">{[m.email, m.phone].filter(Boolean).join(" · ")}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={m.role === "owner" ? "default" : "secondary"} className="capitalize">
                {m.role}
              </Badge>
              {canManage && m.role !== "owner" ? <ResetPassword userId={m.id} label={m.name || m.email || "this person"} /> : null}
              {canManage && m.role !== "owner" ? <RemoveTeammate userId={m.id} label={m.name || m.email || "this person"} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </SettingsPage>
  )
}
