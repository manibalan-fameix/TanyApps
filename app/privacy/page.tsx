import Link from "next/link"

import { TextPage } from "@/components/site/text-page"
import { copy } from "@/lib/copy"

export const metadata = { title: "Privacy Policy | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="Privacy Policy" updated="25 November 2026">
      <p>{copy.brand.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) lets businesses in India publish a web page and manage enquiries, orders and bookings. This policy explains what we collect and why.</p>
      <h2>What we collect</h2>
      <p><strong>Business owners and staff:</strong> your name, email address and profile picture from sign-in; your business name, city, address and phone number; billing and payout details; and what you list, including photos, videos, prices and vehicle registration details.</p>
      <p><strong>Customers of a business:</strong> what you submit on its page, such as your name, phone number, address, messages, and details of an enquiry, order or booking. For deliveries and rides we may also process location, including the live location of a delivery rider or driver during a trip.</p>
      <p><strong>Payments:</strong> online payments are handled by a payment gateway. We receive the payment status and reference numbers. We do not store card details.</p>
      <h2>How we use it</h2>
      <p>To run your account and business page, pass enquiries, orders and bookings to the business you contacted, process payments, read number plates and describe photos with AI, and keep the service secure. We do not sell personal data or use it for advertising.</p>
      <h2>Google sign-in</h2>
      <p>We use Google only to verify who you are. We receive your name, email address and profile picture, and nothing else from your Google account.</p>
      <h2>Facebook sign-in</h2>
      <p>If you choose Facebook, we use it only to verify who you are. We receive your name, email address (if your account has one) and profile picture, and nothing else from your Facebook account. We do not post to Facebook or read your friends, photos or activity. To remove the connection, see our <Link className="underline" href="/data-deletion">data deletion instructions</Link>.</p>
      <h2>Who processes your data</h2>
      <p>We use Cloudflare (hosting and file storage), Neon (database) and Google and Meta (sign-in), Google Gemini (AI) and our payment gateway (payments). Car photos and chat messages may be sent to Google&rsquo;s Gemini API to read plates, write descriptions and answer buyer questions. These providers process data only to provide their service to us.</p>
      <h2>Retention and your rights</h2>
      <p>We keep your data while your account is active. You can ask us to access, correct or delete your data, or close your account, by emailing us. Deleting a business account removes its page and listings. Records we must keep by law, such as payment records, are kept for the required period.</p>
      <h2>Contact</h2>
      <p>Email <a className="underline" href={`mailto:${copy.brand.contactEmail}`}>{copy.brand.contactEmail}</a>.</p>
    </TextPage>
  )
}
