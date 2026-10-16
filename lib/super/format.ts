const inr = new Intl.NumberFormat("en-IN")
export const rupees = (n: number) => `₹${inr.format(Math.round(n))}`
export const num = (n: number) => inr.format(n)

/** ₹1.20 L / ₹3.40 Cr for big numbers, the way the dealer dashboard shows money. */
export const money = (v: number) =>
  v >= 1e7
    ? `₹${(v / 1e7).toFixed(2)} Cr`
    : v >= 1e5
      ? `₹${(v / 1e5).toFixed(2)} L`
      : rupees(v)

const date = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
})
const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
})
export const fmtDate = (iso: string | null | undefined) =>
  iso ? date.format(new Date(iso)) : "—"
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : "—"

export const label = (s: string) =>
  s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())

export const PHASE_LABEL: Record<string, string> = {
  free: "Free",
  trial: "On trial",
  active: "Paying",
  grace: "Payment pending",
  suspended: "Offline",
  legacy: "Legacy",
}
