import Link from "next/link"

import { TextPage } from "@/components/site/text-page"
import { company } from "@/lib/company"
import { copy } from "@/lib/copy"

export const metadata = { title: "Privacy Policy | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="Privacy Policy" updated="27 November 2026">
      <p>{copy.brand.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is run by {company.legalName} and lets businesses in India publish a web page and manage enquiries, orders and bookings. This policy explains what we collect and why.</p>
      <h2>What we collect</h2>
      <p><strong>Business owners and staff:</strong> your name, email address or mobile number, and profile picture from sign-in; your business name, city, address and phone number; billing and payout details; and what you list, including photos, videos, prices and vehicle registration details.</p>
      <p><strong>Customers of a business:</strong> what you submit on its page, such as your name, phone number, address, messages, and details of an enquiry, order or booking. For deliveries and rides we may also process location, including the live location of a delivery rider or driver during a trip.</p>
      <p><strong>Payments:</strong> online payments are handled by a payment gateway. We receive the payment status and reference numbers. We do not store card details.</p>
      <p><strong>Visits to a business&rsquo;s page:</strong> the page or item viewed, taps on shared links, chat use, the type of site you came from (such as WhatsApp or Google), whether you used a phone or a computer, and your country.</p>
      <h2>How we use it</h2>
      <p>To run your account and business page, pass enquiries, orders and bookings to the business you contacted, process payments, read number plates and describe photos with AI, and keep the service secure. We do not sell personal data or use it for advertising.</p>
      <h2>Email and mobile sign-in</h2>
      <p>You can also sign in with an email address and password, or with a code sent to your mobile number. We use Google Firebase to run sign-in and send these codes.</p>
      <h2>Cookies and browser storage</h2>
      <p>We use cookies to keep you signed in and remember choices such as the business or language you selected. Your browser also stores items such as your cart, favourites and chosen location so that pages work. We do not use advertising cookies. Sign-in, payment and map providers may set their own cookies.</p>
      <h2>Google sign-in</h2>
      <p>We use Google only to verify who you are. We receive your name, email address and profile picture, and nothing else from your Google account.</p>
      <h2>Facebook sign-in</h2>
      <p>If you choose Facebook, we use it only to verify who you are. We receive your name, email address (if your account has one) and profile picture, and nothing else from your Facebook account. We do not post to Facebook or read your friends, photos or activity. To remove the connection, see our <Link className="underline" href="/data-deletion">data deletion instructions</Link>.</p>
      <h2>Who processes your data</h2>
      <p>We use Cloudflare (hosting and file storage), Neon (database) and Google (including Firebase) and Meta (sign-in), Google Maps and OpenStreetMap services (maps and addresses), Google Gemini (AI) and our payment gateway (payments). Car photos and chat messages may be sent to Google&rsquo;s Gemini API to read plates, write descriptions and answer buyer questions. These providers receive the data needed for their service and handle it under their own terms. We may also disclose data when the law requires it.</p>
      <h2>Security</h2>
      <p>Our site uses encrypted (HTTPS) connections, and access to account data is limited by sign-in. No online service can promise complete security.</p>
      <h2>Retention and your rights</h2>
      <p>We keep your data while your account is active. You can ask us to access, correct or delete your data, or close your account, by emailing us. Deleting a business account removes its page and listings. Records we must keep by law, such as payment records, are kept for the required period.</p>
      <h2>Changes</h2>
      <p>If we change this policy, we will post the new version and date on this page.</p>
      <h2>Contact and complaints</h2>
      <p>
        For privacy questions, requests or complaints, contact {company.legalName}, {company.address}. Email: <a className="underline" href={`mailto:${company.email}`}>{company.email}</a>. Phone: <a className="underline" href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>.
      </p>
    </TextPage>
  )
}
