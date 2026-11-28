import { TextPage } from "@/components/site/text-page"
import { company } from "@/lib/company"
import { copy } from "@/lib/copy"
import { TRIAL_DAYS } from "@/lib/plans"

export const metadata = { title: "Refunds and Cancellation | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="Refunds and Cancellation" updated="27 November 2026">
      <p>This policy covers subscription fees that businesses pay to {copy.brand.name}.</p>
      <h2>Free trial</h2>
      <p>Paid plans start with a {TRIAL_DAYS}-day free trial. Cancel before the trial ends and you are not charged.</p>
      <h2>Renewal and plan changes</h2>
      <p>Once you authorise a payment method, paid plans renew automatically each month or year until you cancel. An upgrade to a plan you are already paying for is charged straight away. A downgrade starts when the period you have paid for ends.</p>
      <h2>Cancelling</h2>
      <p>You can cancel your subscription at any time from the billing settings in your account, or by emailing us. No further renewals are charged. Your access continues until the end of the period you have already paid for.</p>
      <h2>Refunds</h2>
      <p>Subscription fees already paid are not refunded for part of a month or year. We refund in full:</p>
      <ul>
        <li>a duplicate charge for the same period;</li>
        <li>a charge made after you cancelled;</li>
        <li>a charge for a service we could not provide.</li>
      </ul>
      <p>
        Write to <a className="underline" href={`mailto:${company.email}`}>{company.email}</a> within 7 days of the charge, with the date and amount. Approved refunds go back to the original payment method within 5 to 7 working days. Your bank may take longer to show the amount.
      </p>
      <h2>Contact</h2>
      <p>
        {company.legalName}, {company.address}. Phone: <a className="underline" href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>. Email: <a className="underline" href={`mailto:${company.email}`}>{company.email}</a>.
      </p>
      <h2>Purchases from businesses on our platform</h2>
      <p>Orders, bookings and vehicle purchases are made with the individual business. Ask that business about cancelling or refunding them.</p>
    </TextPage>
  )
}
