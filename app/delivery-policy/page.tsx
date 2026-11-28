import { TextPage } from "@/components/site/text-page"
import { company } from "@/lib/company"
import { copy } from "@/lib/copy"

export const metadata = { title: "Shipping and Delivery | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="Shipping and Delivery" updated="27 November 2026">
      <p>{copy.brand.name} is online software. We ship no physical goods and charge no shipping fee.</p>
      <h2>When you get access</h2>
      <p>Your account is available online once you sign up. A plan&rsquo;s features are switched on once your trial starts or your payment is confirmed, usually within a few minutes.</p>
      <h2>If access does not arrive</h2>
      <p>
        If you have paid and your plan is not active within 24 hours, email <a className="underline" href={`mailto:${company.email}`}>{company.email}</a>.
      </p>
      <h2>Goods sold by businesses</h2>
      <p>Where a business on our platform delivers food or products, that business is responsible for delivery, timing and charges.</p>
    </TextPage>
  )
}
