import { TextPage } from "@/components/site/text-page"
import { company } from "@/lib/company"
import { copy } from "@/lib/copy"

export const metadata = { title: "Contact us | " + copy.brand.name }

export default function Page() {
  return (
    <TextPage title="Contact us">
      <p>Questions about plans, your account, a payment or your data? Get in touch.</p>
      {company.legalName && (
        <>
          <h2>Business name</h2>
          <p>{company.legalName}</p>
        </>
      )}
      <h2>Email</h2>
      <p>
        <a className="underline" href={`mailto:${company.email}`}>{company.email}</a>
      </p>
      {company.phone && (
        <>
          <h2>Phone</h2>
          <p>
            <a className="underline" href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>
          </p>
        </>
      )}
      {company.address && (
        <>
          <h2>Address</h2>
          <p>{company.address}</p>
        </>
      )}
      <p>For a question about an order, booking or vehicle, contact the business you dealt with. Its details are on its own page.</p>
    </TextPage>
  )
}
