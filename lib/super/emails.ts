/**
 * Tany team accounts allowed into the super admin: SUPER_ADMIN_EMAILS (comma separated).
 * In development SEED_OWNER_EMAIL and the dev owner count too, so the local login works without extra setup.
 * No imports on purpose: server actions that only need the list (team management) must not load the auth stack.
 */
export function superAdminEmails(): Set<string> {
  const list = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",")
  if (process.env.NODE_ENV === "development") list.push(process.env.SEED_OWNER_EMAIL?.toLowerCase() || "dev@localhost", "dev@localhost")
  return new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))
}

/**
 * Optional second factor of identity: SUPER_ADMIN_UIDS (comma separated Firebase uids). When set, a super admin must ALSO sign in as
 * one of these uids, so a re-created or re-assigned Firebase account that happens to carry a team address is still refused. Unset
 * means the verified-email list alone applies (the pre-existing behaviour).
 */
export function superAdminUids(): Set<string> {
  return new Set((process.env.SUPER_ADMIN_UIDS ?? "").split(",").map((u) => u.trim()).filter(Boolean))
}
