import type { IndustryKey } from "./keys"

/** Feature flags for verticals that are not open to everyone yet. */
const FLAGS: Partial<Record<IndustryKey, { env: string }>> = {}

export function allowedEmails(industry: IndustryKey, env: Record<string, string | undefined> = process.env): Set<string> {
  const flag = FLAGS[industry]
  if (!flag) return new Set()
  const list = (env[flag.env] ?? "").split(",")
  if (env.NODE_ENV === "development") {
    if (env.SEED_OWNER_EMAIL) list.push(env.SEED_OWNER_EMAIL)
    list.push("dev@localhost")
  }
  return new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))
}

/** Whether this person may create a business of this kind. Unflagged verticals are open to everyone. */
export function canCreateVertical(industry: IndustryKey, email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!FLAGS[industry]) return true
  const e = email?.trim().toLowerCase()
  return Boolean(e) && allowedEmails(industry, env).has(e as string)
}

/** The industries this person can pick in onboarding: the open ones, plus any flagged one they are allowed. */
export function industriesFor(email: string | null | undefined, all: readonly IndustryKey[], env: Record<string, string | undefined> = process.env): IndustryKey[] {
  return all.filter((k) => canCreateVertical(k, email, env))
}
