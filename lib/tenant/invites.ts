import { createHash, randomBytes } from "node:crypto"

import { and, desc, eq, gt, isNull } from "drizzle-orm"
import { z } from "zod"

import { audit } from "../core/audit"
import { countMetric } from "../core/metrics"
import { blindIndex, normalizePhone } from "../crypto/blind-index"
import { decrypt, encrypt } from "../crypto"
import { unscopedDb, type Db } from "../db/client"
import { dealers, dealerUsers, teamInvites } from "../db/schema"
import { scopedDb, type ScopedDb } from "../db/scoped"
import { recordSecurityEvent, recordSecurityEventBestEffort } from "../core/security-audit"

/**
 * Staff invitations. The owner decides who may join and with which role; the invited person proves they are that person by signing in
 * with their own Firebase identity (a verified email, or an OTP-verified phone). Nothing here ever creates a user, sets a password or
 * touches an existing account: acceptance adds one `dealer_users` row for one business and nothing else.
 *
 *  - The secret token appears once, in the link the owner copies. Only its sha256 is stored.
 *  - An invitation is single-use, expires, and can be revoked. It carries `staff` only (also a database CHECK).
 *  - Creating an invitation never looks the person up, so it cannot reveal whether an email or number has an account anywhere.
 *  - Acceptance is decided by one conditional UPDATE, so concurrent or repeated acceptance cannot create two memberships.
 */

export const INVITE_TTL_DAYS = 7
/** A business may have this many open invitations at once. */
export const MAX_OPEN_INVITES = 50
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/ // 32 random bytes, base64url

/** One transaction for a business, handing out both the scoped handle and the raw transaction (for the security trail, written atomically). */
function tenantTransaction<T>(dealerId: string, fn: (db: ScopedDb, tx: Db) => Promise<T>): Promise<T> {
  return unscopedDb.transaction(async (tx) => fn(scopedDb(dealerId, tx as unknown as Db), tx as unknown as Db))
}

export const newInviteToken = () => randomBytes(32).toString("base64url")
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex")

export type Contact = { kind: "email" | "phone"; value: string; emailHash: string | null; phoneHash: string | null }

/** One invited contact from what an owner typed: an email address or an Indian mobile number. Null when it is neither. */
export function parseContact(input: unknown): Contact | null {
  const raw = typeof input === "string" ? input.trim() : ""
  if (!raw) return null
  if (raw.includes("@")) {
    const email = z.string().email().max(254).safeParse(raw.toLowerCase())
    return email.success ? { kind: "email", value: email.data, emailHash: blindIndex("email", email.data), phoneHash: null } : null
  }
  const phone = normalizePhone(raw)
  return phone ? { kind: "phone", value: phone, emailHash: null, phoneHash: blindIndex("phone", phone) } : null
}

export type CreatedInvite = { ok: true; id: string; token: string; expiresAt: Date } | { ok: false; error: "invalid_contact" | "too_many" }

export async function createInvite(dealerId: string, actorId: string, rawContact: unknown, now = new Date()): Promise<CreatedInvite> {
  const contact = parseContact(rawContact)
  if (!contact) return { ok: false, error: "invalid_contact" }
  const token = newInviteToken()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000)

  return tenantTransaction(dealerId, async (db, tx) => {
    const open = await db.teamInvites.count(and(isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt)))
    if (open >= MAX_OPEN_INVITES) return { ok: false as const, error: "too_many" as const }
    // A new invitation for the same contact replaces the open one, so there is never more than one live link per person.
    const same = contact.emailHash ? eq(teamInvites.emailHash, contact.emailHash) : eq(teamInvites.phoneHash, contact.phoneHash!)
    await db.teamInvites.update({ revokedAt: now, revokedBy: actorId }, and(same, isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt))!)
    const [row] = await db.teamInvites
      .insert({ role: "staff", tokenHash: hashInviteToken(token), emailHash: contact.emailHash, phoneHash: contact.phoneHash, contactEnc: encrypt(contact.value), invitedBy: actorId, expiresAt })
      .returning({ id: teamInvites.id })
    await audit(db, { actorType: "user", actorId, action: "team.invite_created", entity: "team_invite", entityId: row.id, diff: { role: "staff", kind: contact.kind } })
    await recordSecurityEvent({ actorType: "owner", actorId, businessId: dealerId, action: "team.invite_created", targetType: "team_invite", targetId: row.id, outcome: "success", metadata: { role: "staff", kind: contact.kind } }, tx)
    return { ok: true as const, id: row.id, token, expiresAt }
  })
}

export type OpenInvite = { id: string; contact: string; createdAt: Date; expiresAt: Date; expired: boolean }

/** The business's open (not accepted, not revoked) invitations, newest first. */
export async function listOpenInvites(dealerId: string, now = new Date()): Promise<OpenInvite[]> {
  const rows = await scopedDb(dealerId).teamInvites.select(and(isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt)), { orderBy: [desc(teamInvites.createdAt)], limit: MAX_OPEN_INVITES })
  return rows.map((r) => ({ id: r.id, contact: decrypt(r.contactEnc), createdAt: r.createdAt, expiresAt: r.expiresAt, expired: r.expiresAt <= now }))
}

export async function revokeInvite(dealerId: string, actorId: string, inviteId: string, now = new Date()): Promise<boolean> {
  return tenantTransaction(dealerId, async (db, tx) => {
    const done = await db.teamInvites
      .update({ revokedAt: now, revokedBy: actorId }, and(eq(teamInvites.id, inviteId), isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt))!)
      .returning({ id: teamInvites.id })
    if (done.length === 0) return false
    await audit(db, { actorType: "user", actorId, action: "team.invite_revoked", entity: "team_invite", entityId: inviteId })
    await recordSecurityEvent({ actorType: "owner", actorId, businessId: dealerId, action: "team.invite_revoked", targetType: "team_invite", targetId: inviteId, outcome: "success" }, tx)
    return true
  })
}

/** What the invitation page may show someone who holds the (secret) link: the business name, while the invitation is still usable. */
export async function peekInvite(token: string, now = new Date()): Promise<{ businessName: string } | null> {
  if (!TOKEN_RE.test(token)) return null
  const [row] = await unscopedDb
    .select({ name: dealers.displayName })
    .from(teamInvites)
    .innerJoin(dealers, eq(dealers.id, teamInvites.dealerId))
    .where(and(eq(teamInvites.tokenHash, hashInviteToken(token)), isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt), gt(teamInvites.expiresAt, now)))
    .limit(1)
  return row ? { businessName: row.name } : null
}

/** What Firebase itself verified at this person's sign-in (see lib/auth/session-claims.ts). Never a profile field. */
export type VerifiedContact = { email: string | null; phone: string | null }

export type AcceptResult =
  | { ok: true; dealerId: string; alreadyMember: boolean }
  /** One answer for every failure (unknown, forged, expired, revoked, used, wrong person), so nothing is revealed about who or what exists. */
  | { ok: false; error: "invalid" }

const INVALID: AcceptResult = { ok: false, error: "invalid" }

export async function acceptInvite(token: string, userId: string, verified: VerifiedContact, now = new Date()): Promise<AcceptResult> {
  let known: { id: string; dealerId: string } | null = null
  const fail = async (reason: string): Promise<AcceptResult> => {
    countMetric("team_invite_rejected", { reason })
    // Only attempts against a REAL invitation are recorded, so strangers guessing tokens cannot fill the trail.
    if (known && userId) await recordSecurityEventBestEffort({ actorType: "user", actorId: userId, businessId: known.dealerId, action: "team.invite_accepted", targetType: "team_invite", targetId: known.id, outcome: "denied", metadata: { reason } })
    return INVALID
  }
  if (!userId || !TOKEN_RE.test(token)) return fail("malformed")
  const [invite] = await unscopedDb.select().from(teamInvites).where(eq(teamInvites.tokenHash, hashInviteToken(token))).limit(1)
  if (!invite) return fail("unknown")
  known = { id: invite.id, dealerId: invite.dealerId }

  // The person must be who the invitation was written for, proven by Firebase: a verified email or an OTP-verified phone.
  const email = verified.email ? blindIndex("email", verified.email.trim().toLowerCase()) : null
  const phoneE164 = verified.phone ? normalizePhone(verified.phone) : null
  const phone = phoneE164 ? blindIndex("phone", phoneE164) : null
  const isThem = (email !== null && email === invite.emailHash) || (phone !== null && phone === invite.phoneHash)
  if (!isThem) return fail("identity_mismatch")

  const claimed = await tenantTransaction(invite.dealerId, async (db, tx) => {
    // The single serialisation point: only one caller can flip an open, unexpired invitation to accepted.
    const won = await db.teamInvites
      .update({ acceptedBy: userId, acceptedAt: now }, and(eq(teamInvites.id, invite.id), isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt), gt(teamInvites.expiresAt, now))!)
      .returning({ id: teamInvites.id })
    if (won.length === 0) return false
    // Membership only. ON CONFLICT keeps an existing role (an owner is never turned into staff, staff never promoted).
    await db.dealerUsers.insert({ userId, role: "staff" }).onConflictDoNothing()
    await audit(db, { actorType: "user", actorId: userId, action: "team.invite_accepted", entity: "team_invite", entityId: invite.id, diff: { role: "staff" } })
    await recordSecurityEvent({ actorType: "user", actorId: userId, businessId: invite.dealerId, action: "team.invite_accepted", targetType: "team_invite", targetId: invite.id, outcome: "success", metadata: { role: "staff" } }, tx)
    return true
  })
  if (claimed) return { ok: true, dealerId: invite.dealerId, alreadyMember: false }

  // Lost the race or a repeat: only the person who already accepted it gets a (safe, idempotent) success.
  const [fresh] = await unscopedDb.select({ by: teamInvites.acceptedBy, revoked: teamInvites.revokedAt }).from(teamInvites).where(eq(teamInvites.id, invite.id)).limit(1)
  if (fresh?.by === userId) {
    // Success only while the membership still exists: a teammate the owner has since removed cannot use the old link to come back.
    const [still] = await unscopedDb.select({ u: dealerUsers.userId }).from(dealerUsers).where(and(eq(dealerUsers.dealerId, invite.dealerId), eq(dealerUsers.userId, userId))).limit(1)
    return still ? { ok: true as const, dealerId: invite.dealerId, alreadyMember: true } : fail("removed")
  }
  return fail(fresh?.by ? "already_used" : fresh?.revoked ? "revoked" : "expired")
}
