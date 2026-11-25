import Link from "next/link"

import { TextPage } from "@/components/site/text-page"
import { copy } from "@/lib/copy"

export const metadata = { title: "Terms of Service | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="Terms of Service" updated="25 November 2026">
      <p>By using {copy.brand.name} you agree to these terms.</p>
      <h2>The service</h2>
      <p>{copy.brand.name} is subscription software that lets businesses publish a web page and manage enquiries, orders and bookings. It is not a party to any sale between a business and its customer. Each business is responsible for what it sells and for holding the licences its trade requires.</p>
      <h2>Your account</h2>
      <p>Sign in with Google and keep your account secure. You are responsible for activity under your account and for the accuracy of what you list. Prices and descriptions must be truthful, including a vehicle&rsquo;s condition, ownership and accident history.</p>
      <h2>Fees and cancellation</h2>
      <p>Paid plans are billed monthly or yearly at the prices on our <Link className="underline" href="/pricing">pricing page</Link>. Cancellations and refunds follow our <Link className="underline" href="/refund-policy">refunds and cancellation policy</Link>.</p>
      <h2>Acceptable use</h2>
      <p>Do not list stolen, counterfeit, misrepresented or unlawful goods or services, upload content you do not have the right to use, or misuse the service, including attempts to disrupt it or access other businesses&rsquo; data.</p>
      <h2>Content</h2>
      <p>You keep ownership of the photos and details you upload and give us permission to store and display them to run the service. We may remove listings that break these terms.</p>
      <h2>Availability and liability</h2>
      <p>The service is provided as is. We work to keep it available but do not guarantee it will be uninterrupted or error free, and we are not liable for losses arising from sales, orders, bookings, enquiries or downtime, to the extent the law allows.</p>
      <h2>Changes and contact</h2>
      <p>We may update these terms and will post the new date here. Questions: <a className="underline" href={`mailto:${copy.brand.contactEmail}`}>{copy.brand.contactEmail}</a>.</p>
    </TextPage>
  )
}
