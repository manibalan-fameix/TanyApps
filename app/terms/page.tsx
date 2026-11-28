import Link from "next/link"

import { TextPage } from "@/components/site/text-page"
import { company } from "@/lib/company"
import { copy } from "@/lib/copy"
import { TRIAL_DAYS } from "@/lib/plans"
import { GRACE_DAYS } from "@/lib/billing/state"

export const metadata = { title: "Terms of Service | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="Terms of Service" updated="27 November 2026">
      <p>{copy.brand.name} is run by {company.legalName}, {company.address} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using {copy.brand.name} you agree to these terms.</p>
      <h2>The service</h2>
      <p>{copy.brand.name} is subscription software that lets businesses publish a web page and manage enquiries, orders and bookings. It is not a party to any sale between a business and its customer. Each business is responsible for what it sells and for holding the licences its trade requires.</p>
      <h2>Your account</h2>
      <p>Sign in using one of the methods on our sign-in page and keep your account secure. You must be at least 18 and allowed to act for your business. You are responsible for activity under your account and for the accuracy of what you list. Prices and descriptions must be truthful, including a vehicle&rsquo;s condition, ownership and accident history.</p>
      <h2>Plans, fees and payment</h2>
      <p>Prices are in Indian rupees and are shown on our <Link className="underline" href="/pricing">pricing page</Link>. Paid plans are billed monthly or yearly through a third-party payment gateway. We do not store your card details.</p>
      <ul>
        <li>Paid plans start with a {TRIAL_DAYS}-day free trial.</li>
        <li>Once you authorise a payment method, your plan renews automatically at the end of each billing period until you cancel. The first charge is made when the trial ends.</li>
        <li>An upgrade to a paid plan you are already paying for takes effect at once and is charged straight away. A downgrade takes effect when the period you have paid for ends.</li>
        <li>If a renewal payment fails, your page stays online for {GRACE_DAYS} days while the payment is retried. If it is still unpaid, your page goes offline.</li>
        <li>If a trial or paid period ends without a payment method, your page goes offline until you add one.</li>
      </ul>
      <h2>Cancellation and refunds</h2>
      <p>You can cancel at any time. Cancellations and refunds follow our <Link className="underline" href="/refund-policy">refunds and cancellation policy</Link>. Access to our software is delivered as set out in our <Link className="underline" href="/delivery-policy">shipping and delivery policy</Link>.</p>
      <h2>Orders and payments between a business and its customers</h2>
      <p>A business is the seller of everything on its page. Its prices, quality, delivery, cancellations, refunds and customer complaints are its responsibility. Online payments to a business are processed by a third-party payment gateway.</p>
      <h2>Acceptable use</h2>
      <p>Do not list stolen, counterfeit, misrepresented or unlawful goods or services, upload content you do not have the right to use, sell alcohol, tobacco, illegal drugs, weapons, adult content, gambling or any other item that the law or our payment gateway does not allow, or misuse the service, including attempts to disrupt it or access other businesses&rsquo; data.</p>
      <h2>Content</h2>
      <p>You keep ownership of the photos and details you upload and give us permission to store and display them to run the service. We may remove listings that break these terms.</p>
      <h2>Suspension and closing an account</h2>
      <p>We may suspend or close an account that breaks these terms or the law, or does not pay. You may close your account at any time by emailing us. See <Link className="underline" href="/data-deletion">data deletion</Link>.</p>
      <h2>Availability and liability</h2>
      <p>The service is provided as is. We work to keep it available but do not guarantee it will be uninterrupted or error free, and we are not liable for losses arising from sales, orders, bookings, enquiries or downtime, to the extent the law allows.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India. The courts of Sivaganga District, Tamil Nadu have jurisdiction over any dispute.</p>
      <h2>Changes and contact</h2>
      <p>We may update these terms and will post the new date here. Questions and complaints: <a className="underline" href={`mailto:${company.email}`}>{company.email}</a>, <a className="underline" href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>, or write to {company.legalName}, {company.address}.</p>
    </TextPage>
  )
}
