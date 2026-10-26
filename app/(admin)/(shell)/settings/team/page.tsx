import { redirect } from "next/navigation"

import { SettingsPage } from "@/components/settings/settings-page"
import { InviteTeammate, RemoveTeammate, RevokeInvite } from "@/components/settings/team-actions"
import { Badge } from "@/components/ui/badge"
import { getDealerContext } from "@/lib/auth/context"
import { listOpenInvites } from "@/lib/tenant/invites"
import { listTeamMembers } from "@/lib/tenant/team"

export const metadata = { title: "Team" }

export default async function TeamPage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")
  const members = ctx.dealerInDb
    ? await listTeamMembers(ctx.dealer.id)
    : [{ id: ctx.user.id, name: ctx.user.name ?? null, email: ctx.user.email ?? null, phone: null, role: ctx.role, legacyPassword: false }]

  const canManage = ctx.role === "owner" && ctx.dealerInDb
  const invites = canManage ? await listOpenInvites(ctx.dealer.id) : []
  return (
    <SettingsPage title="Team" description="People who can sign in to this dealership." action={canManage ? <InviteTeammate /> : undefined}>
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
              {m.legacyPassword ? <Badge variant="outline">Password sign-in</Badge> : null}
              {canManage && m.role !== "owner" ? <RemoveTeammate userId={m.id} label={m.name || m.email || "this person"} /> : null}
            </div>
          </li>
        ))}
      </ul>
      {invites.length > 0 ? (
        <section className="mt-8" aria-labelledby="open-invites">
          <h2 id="open-invites" className="text-sm font-medium">Open invitations</h2>
          <p className="text-sm text-muted-foreground">Waiting for the person to sign in with their own account and accept.</p>
          <ul className="mt-2 divide-y">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.contact}</p>
                  <p className="text-sm text-muted-foreground">{i.expired ? "Expired" : `Expires ${i.expiresAt.toLocaleDateString("en-IN")}`}</p>
                </div>
                <RevokeInvite inviteId={i.id} label={i.contact} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SettingsPage>
  )
}
