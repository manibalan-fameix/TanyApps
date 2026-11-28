import { randomBytes } from "node:crypto"

import { asc, eq, gt, isNotNull, or, sql } from "drizzle-orm"

import { CustomHostnameError, cnameTarget, createCustomHostname, deleteCustomHostname, getCustomHostname, lookupDns } from "../cloudflare/custom-hostnames"
import { audit } from "../core/audit"
import { safeErrorMessage } from "../core/safe-error"
import { unscopedDb } from "../db/client"
import { scopedDb } from "../db/scoped"
import { dealerDomains, dealers } from "../db/schema"
import { getPlan } from "../plans"
import { effectivePlanKey } from "../billing/state"
import { UNVERIFIED_CLAIM_TTL_MS, cnameValue, shouldServe, verificationRecordName, verificationRecordValue } from "../domains/hostname"
import { customDomainOrigin, tenantUrl } from "../env"
import { forgetDomain, resolvePrimaryHost } from "./lookup"

// A business's own domain, from claim to main address. Callers check who is asking and whether the plan allows it.
// One domain per business. The raw client is used only where a question spans businesses: who holds a name, and the sweep.

export type Business = { id: string; slug: string }
export type DomainRow = typeof dealerDomains.$inferSelect
export type DomainResult = { ok: true; note?: string } | { ok: false; error: string }

const MISSING: DomainResult = { ok: false, error: "Add your domain first." }
const UNREACHABLE: DomainResult = { ok: false, error: "We could not check your domain just now. Please try again in a few minutes." }

/** The address to show and share: the business's own domain while it is the main one, else <slug>.<root>. */
export async function siteUrl(slug: string, path = "/"): Promise<string> {
  const host = await resolvePrimaryHost(slug)
  return host ? `${customDomainOrigin(host)}${path}` : tenantUrl(slug, path)
}

export async function getDomain(dealerId: string): Promise<DomainRow | null> {
  const [row] = await scopedDb(dealerId).dealerDomains.select(undefined, { limit: 1 })
  return row ?? null
}

const record = (business: Business, actorId: string, action: string, hostname: string) =>
  audit(scopedDb(business.id), { actorType: "user", actorId, action: `domain.${action}`, entity: "domain", entityId: hostname })

export async function addDomain(business: Business, hostname: string, actorId: string, now = new Date()): Promise<DomainResult> {
  if (await getDomain(business.id)) return { ok: false, error: "Remove your current domain before adding another." }
  const taken: DomainResult = { ok: false, error: "That domain is already connected to another business. If it is yours, contact Tany support." }

  const [held] = await unscopedDb.select().from(dealerDomains).where(eq(dealerDomains.hostname, hostname)).limit(1)
  if (held) {
    const abandoned = !held.verifiedAt && !held.primaryAt && now.getTime() - held.createdAt.getTime() > UNVERIFIED_CLAIM_TTL_MS
    if (!abandoned) return taken
    if (held.cfHostnameId) {
      try {
        await deleteCustomHostname(held.cfHostnameId)
      } catch (error) {
        console.error("could not release an abandoned domain:", safeErrorMessage(error))
        return UNREACHABLE
      }
    }
    await scopedDb(held.dealerId).dealerDomains.delete(eq(dealerDomains.hostname, hostname))
  }

  const added = await scopedDb(business.id)
    .dealerDomains.insert({ hostname, verificationToken: randomBytes(16).toString("hex") })
    .onConflictDoNothing()
    .returning()
  // Another request took the name, or this business's one slot, in between.
  if (added.length === 0) return taken
  await record(business, actorId, "add", hostname)
  return { ok: true }
}

/**
 * Brings the row up to date with Cloudflare and returns whether the domain is serving. A failed call throws and changes nothing.
 */
async function syncWithCloudflare(row: DomainRow & { cfHostnameId: string }, slug: string, now: Date): Promise<boolean> {
  const remote = await getCustomHostname(row.cfHostnameId)
  const serving = shouldServe(remote, row.verifiedAt !== null)
  await scopedDb(row.dealerId).dealerDomains.update(
    // Gone from Cloudflare: forget the id, so the next check proves ownership and registers it again.
    { verifiedAt: serving ? (row.verifiedAt ?? now) : null, cfHostnameId: remote ? row.cfHostnameId : null, lastCheckedAt: now },
    eq(dealerDomains.hostname, row.hostname),
  )
  if (serving !== (row.verifiedAt !== null)) forgetDomain(slug, row.hostname)
  return serving
}

type Progress = { proven: boolean; note: string }

/**
 * Takes a domain as far as it can go now: prove ownership from DNS, register with Cloudflare, then read how far that has got.
 * Safe to repeat. A failed DNS or Cloudflare call throws.
 */
async function advance(row: DomainRow, slug: string, now: Date): Promise<Progress> {
  const target = cnameTarget()
  const scoped = scopedDb(row.dealerId)
  const mine = eq(dealerDomains.hostname, row.hostname)
  // A row with no token (made by hand) is given one now and must be proved like any other.
  const token = row.verificationToken ?? randomBytes(16).toString("hex")
  if (!row.verificationToken) await scoped.dealerDomains.update({ verificationToken: token }, mine)
  const expected = cnameValue(token, target)

  let cfHostnameId = row.cfHostnameId
  if (!cfHostnameId) {
    // Our own proof comes first. Cloudflare alone would accept any CNAME to us, including one left behind by a previous owner.
    const cname = await lookupDns(row.hostname, "CNAME")
    const proven = cname.includes(expected) || (await lookupDns(verificationRecordName(row.hostname), "TXT")).includes(verificationRecordValue(token))
    if (!proven) {
      await scoped.dealerDomains.update({ lastCheckedAt: now }, mine)
      return {
        proven: false,
        note: cname.length
          ? `We still see ${cname[0]} in your record. If you have just changed it, this can take an hour or more and we will keep checking. The value should be ${expected}.`
          : "We cannot see your record yet. DNS changes can take a few hours to appear.",
      }
    }
    cfHostnameId = await createCustomHostname(row.hostname)
    await scoped.dealerDomains.update({ cfHostnameId }, mine)
  }
  if (await syncWithCloudflare({ ...row, cfHostnameId }, slug, now)) return { proven: true, note: "Your domain is working." }
  const cname = await lookupDns(row.hostname, "CNAME")
  return {
    proven: true,
    note: cname.includes(expected)
      ? "Your record is correct. The security certificate is being issued, which usually takes a few minutes."
      : `Ownership is confirmed. Now check the CNAME record: its value should be ${expected}.`,
  }
}

/** The owner's check, whether they pressed the button or the open settings page asked on its own. */
export async function checkDomain(business: Business, now = new Date()): Promise<DomainResult> {
  const row = await getDomain(business.id)
  if (!row) return MISSING
  try {
    const { proven, note } = await advance(row, business.slug, now)
    return proven ? { ok: true, note } : { ok: false, error: note }
  } catch (error) {
    if (!(error instanceof CustomHostnameError)) throw error
    console.error("domain check failed:", safeErrorMessage(error))
    return UNREACHABLE
  }
}

/** The owner's confirmation that this domain replaces <slug>.<root> as the main address. */
export async function makePrimary(business: Business, actorId: string, now = new Date()): Promise<DomainResult> {
  const row = await getDomain(business.id)
  if (!row) return MISSING
  if (!row.verifiedAt || !row.cfHostnameId) return { ok: false, error: "Your domain is not ready yet. Run the check first." }
  try {
    // Ask again now: redirecting every visitor to a domain that has since stopped working would take the shop offline.
    if (!(await syncWithCloudflare({ ...row, cfHostnameId: row.cfHostnameId }, business.slug, now))) {
      return { ok: false, error: "Your domain has stopped working. Check your DNS records first." }
    }
  } catch (error) {
    console.error("domain confirmation failed:", safeErrorMessage(error))
    return UNREACHABLE
  }
  await scopedDb(business.id).dealerDomains.update({ primaryAt: now }, eq(dealerDomains.hostname, row.hostname))
  await record(business, actorId, "make_primary", row.hostname)
  forgetDomain(business.slug, row.hostname)
  return { ok: true }
}

/** Back to <slug>.<root> as the main address. The own domain keeps working alongside it. */
export async function useDefaultAddress(business: Business, actorId: string): Promise<DomainResult> {
  const row = await getDomain(business.id)
  if (!row) return MISSING
  await scopedDb(business.id).dealerDomains.update({ primaryAt: null }, eq(dealerDomains.hostname, row.hostname))
  await record(business, actorId, "use_default", row.hostname)
  forgetDomain(business.slug, row.hostname)
  return { ok: true }
}

export async function removeDomain(business: Business, actorId: string): Promise<DomainResult> {
  const row = await getDomain(business.id)
  if (!row) return MISSING
  // Cloudflare first: if it fails the row stays, so we never lose track of a hostname we are billed for.
  if (row.cfHostnameId) {
    try {
      await deleteCustomHostname(row.cfHostnameId)
    } catch (error) {
      console.error("could not remove domain:", safeErrorMessage(error))
      return { ok: false, error: "We could not remove the domain just now. Please try again in a few minutes." }
    }
  }
  await scopedDb(business.id).dealerDomains.delete(eq(dealerDomains.hostname, row.hostname))
  await record(business, actorId, "remove", row.hostname)
  forgetDomain(business.slug, row.hostname)
  return { ok: true }
}

/** Small enough to finish inside the cron call's time limit; the longest unchecked go first, so every domain gets its turn. */
const SWEEP_BATCH = 20
const SWEEP_BUDGET_MS = 18_000
/** How long the sweep keeps looking for the record of a domain that has not proved ownership. After that, the owner's page still checks. */
const WAIT_FOR_RECORD_MS = 7 * 24 * 3_600_000

/**
 * The scheduled sweep: connects new domains once their record appears (the owner need not come back), switches off ones that
 * stopped pointing here (so the default address stops redirecting to a dead one) and switches them back on when they recover.
 */
export async function sweepDomains(now = new Date()): Promise<{ checked: number; changed: number; failed: number }> {
  const rows = await unscopedDb
    .select({ domain: dealerDomains, slug: dealers.slug, plan: dealers.plan, nextPlan: dealers.nextPlan, nextPlanStartsAt: dealers.nextPlanStartsAt })
    .from(dealerDomains)
    .innerJoin(dealers, eq(dealers.id, dealerDomains.dealerId))
    .where(or(isNotNull(dealerDomains.cfHostnameId), gt(dealerDomains.createdAt, new Date(now.getTime() - WAIT_FOR_RECORD_MS))))
    .orderBy(sql`${dealerDomains.lastCheckedAt} asc nulls first`, asc(dealerDomains.createdAt))
    .limit(SWEEP_BATCH)
  const out = { checked: 0, changed: 0, failed: 0 }
  const started = Date.now()
  for (const { domain, ...dealer } of rows) {
    if (Date.now() - started > SWEEP_BUDGET_MS) break
    // Every row looked at is stamped, so one that is skipped or keeps failing cannot hold its place at the front.
    const stamp = () => scopedDb(domain.dealerId).dealerDomains.update({ lastCheckedAt: now }, eq(dealerDomains.hostname, domain.hostname))
    try {
      // Registering a new name can cost money, so only for a plan that includes it. Registered ones are always kept in step.
      if (!domain.cfHostnameId && !getPlan(effectivePlanKey(dealer)).customDomain) {
        await stamp()
        continue
      }
      await advance(domain, dealer.slug, now)
      const after = await getDomain(domain.dealerId)
      if (Boolean(after?.verifiedAt) !== Boolean(domain.verifiedAt)) out.changed++
      out.checked++
    } catch (error) {
      out.failed++
      console.error("domain sweep failed for one domain:", safeErrorMessage(error))
      await stamp()
    }
  }
  return out
}
