import { PageHeader } from "@/components/restaurant/page-header"
import { ListCard } from "@/components/super/metrics"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { copy } from "@/lib/copy"
import { INDUSTRY_KEYS } from "@/lib/industries"
import { superAdminEmails, requireSuperAdmin } from "@/lib/super/guard"
import { loadCronStatus, loadSystemHealth } from "@/lib/super/queries"
import { fmtDateTime, num } from "@/lib/super/format"

export const metadata = { title: "Platform" }

const configured = (name: string) => Boolean(process.env[name])

/** Which services are wired up, and who is on the Tany team. Names only: no secret value is ever shown. */
export default async function PlatformPage() {
  await requireSuperAdmin()
  const services: [string, string[]][] = [
    ["Database", ["DATABASE_URL"]],
    [
      "Sign-in (Firebase)",
      [
        "FIREBASE_PROJECT_ID",
        "FIREBASE_API_KEY",
        "FIREBASE_APP_ID",
        "AUTH_SECRET",
      ],
    ],
    [
      "Payments (Razorpay)",
      ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    ],
    [
      "Media storage (R2)",
      [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "R2_PUBLIC_URL",
      ],
    ],
    ["Encryption", ["ENCRYPTION_KEY"]],
    ["RC lookup", ["RC_PROVIDER", "RC_API_KEY"]],
  ]
  const team = [...superAdminEmails()]
  const health = await loadSystemHealth()
  const cron = await loadCronStatus()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Platform"
        description="The Tany team and the services this deployment is connected to."
      />
      <ListCard
        title="Scheduled jobs"
        hint="Latest run of each job in the last 2 days. Failed or stuck runs are listed first; the scheduler retries them."
        empty="No scheduled job has run in the last 2 days."
        rows={cron.map((c) => ({
          key: c.job,
          primary: `${c.job} · ${c.stuck ? "stuck" : c.status}`,
          secondary: `${c.result ?? "no result yet"}${c.attempts > 1 ? ` · attempt ${c.attempts}` : ""}`,
          right: fmtDateTime(c.startedAt.toISOString()),
        }))}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>
              Set SUPER_ADMIN_EMAILS to change this list
            </CardDescription>
            <CardTitle className="text-base">Tany team access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {team.map((e) => (
              <p key={e} className="py-2 font-medium">
                {e}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Brand and industries</CardDescription>
            <CardTitle className="text-base">{copy.brand.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {INDUSTRY_KEYS.map((k) => (
              <Badge key={k} variant="secondary" className="capitalize">
                {k}
              </Badge>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardDescription>Rows in each table, and how fast the database answers</CardDescription>
            <CardTitle className="flex items-center gap-2 text-base">
              Database
              <Badge variant={health.dbMs == null ? "destructive" : "default"}>{health.dbMs == null ? "Unreachable" : `${health.dbMs} ms`}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
            {health.counts.map((c) => (
              <div key={c.label} className="flex items-center justify-between border-b py-2">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="font-medium">{num(c.count)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardDescription>
              Whether each set of keys is present on this server
            </CardDescription>
            <CardTitle className="text-base">Connected services</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {services.map(([name, keys]) => {
              const missing = keys.filter((k) => !configured(k))
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{name}</p>
                    {missing.length ? (
                      <p className="truncate text-muted-foreground">
                        Missing {missing.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={missing.length ? "secondary" : "default"}>
                    {missing.length ? "Not set" : "Connected"}
                  </Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
