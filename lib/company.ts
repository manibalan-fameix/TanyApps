import { copy } from "@/lib/copy"

/**
 * Business details printed on the public website. Payment gateways check these against the KYC documents, so fill them in
 * exactly as registered (PAN / GST / Udyam certificate). Empty fields are left off the pages.
 */
export const company = {
  /** Registered business name, for example the name on the PAN or GST certificate. */
  legalName: "Tany",
  /** Registered or operating address, on one line. */
  address: "No. 1/30/2, Mahizh Kudil, Nethaji Street, Piravaloor, Okkur Block, Sivaganga District, Tamil Nadu 630557",
  /** A phone number that is answered, with country code. */
  phone: "+91 80726 56887",
  email: copy.brand.contactEmail,
}

export const SITE_PAGES = [
  { href: "/about", label: "About us" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact us" },
] as const

export const POLICY_PAGES = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refunds and Cancellation" },
  { href: "/delivery-policy", label: "Service Delivery" },
  { href: "/data-deletion", label: "Data Deletion" },
] as const
