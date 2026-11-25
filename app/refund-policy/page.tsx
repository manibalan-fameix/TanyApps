import { TextPage } from "@/components/site/text-page"
import { company } from "@/lib/company"
import { copy } from "@/lib/copy"
import { TRIAL_DAYS } from "@/lib/plans"

export const metadata = { title: "Refunds and Cancellation | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="Refunds and Cancellation" updated="25 November 2026">
      <p>This policy covers subscription fees that businesses pay to {copy.brand.name}.</p>
      <h2>Free trial</h2>
      <p>Paid plans start with a {TRIAL_DAYS}-day free trial. Cancel before the trial ends and you are not charged.</p>
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
        Write to <a className="underline" href={`mailto:${company.email}`}>{company.email}</a> within 7 days of the charge, with the date and amount. Approved refunds go back to the original payment method within 5 to 7 working days.
      </p>
      <h2>Purchases from businesses on our platform</h2>
      <p>Orders, bookings and vehicle purchases are made with the individual business. Ask that business about cancelling or refunding them.</p>
    </TextPage>
  )
}
