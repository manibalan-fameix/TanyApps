import Link from "next/link"

import { TextPage } from "@/components/site/text-page"
import { company } from "@/lib/company"
import { copy } from "@/lib/copy"
import { productForIndustry } from "@/lib/products"
import { verticalList } from "@/lib/verticals"

export const metadata = { title: "About us | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="About us">
      <p>
        {copy.brand.name} is a software service for local businesses in India{company.legalName && <>, run by {company.legalName}</>}. Car dealers, restaurants, cab operators and shops use it to publish their own web page and to manage enquiries, orders and bookings.
      </p>
      <h2>What we sell</h2>
      <p>We sell subscriptions to our software. Businesses pick a plan and pay us for the use of the platform. Prices are in Indian rupees on our <Link className="underline" href="/pricing">pricing page</Link>.</p>
      <ul>
        {verticalList.map((v) => (
          <li key={v.key}>
            <strong>{productForIndustry(v.key).name}:</strong> {v.blurb}
          </li>
        ))}
      </ul>
      <h2>What we do not sell</h2>
      <p>We do not sell the cars, food, rides or goods shown on a business&rsquo;s page. Each business sets its own prices and is responsible for what it sells, for delivering it and for its own legal licences.</p>
      <h2>Our details</h2>
      <p>
        {company.legalName}, {company.address}. Phone: <a className="underline" href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>. Email: <a className="underline" href={`mailto:${company.email}`}>{company.email}</a>.
      </p>
    </TextPage>
  )
}
