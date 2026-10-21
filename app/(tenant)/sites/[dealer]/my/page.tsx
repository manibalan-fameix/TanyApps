import { eq } from "drizzle-orm"

import { AccountForms } from "@/components/cabs/book/account-forms"
import { bookingText } from "@/lib/cabs/booking-copy"
import { customerPage } from "@/lib/cabs/customer-page"
import { picksFor } from "@/lib/cabs/quick-picks"
import { placeText } from "@/lib/cabs/trip-data"
import { decrypt, tryDecrypt } from "@/lib/crypto"
import { customerAddresses, customerContacts } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export default async function MyAccount({ params }: { params: Promise<{ dealer: string }> }) {
  const { db, lang, customer } = await customerPage(params, "/my")
  const t = bookingText(lang)
  const [addresses, contacts, settings] = await Promise.all([
    db.customerAddresses.select(eq(customerAddresses.customerId, customer.id)),
    db.customerContacts.select(eq(customerContacts.customerId, customer.id)),
    db.cabSettings.select(),
  ])
  const quick = picksFor(settings[0]?.serviceCities ?? []).map((q) => ({ key: q.key, label: lang === "ta" ? q.ta : q.en }))
  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-6 text-xl font-semibold">{t.accountTitle}</h1>
      <AccountForms
        lang={lang}
        name={customer.name ?? ""}
        phone={decrypt(customer.phoneEnc).replace(/^\+91/, "+91 ")}
        quick={quick}
        addresses={addresses.map((a) => ({ id: a.id, label: a.label, text: placeText({ addressEnc: a.addressEnc, placeId: a.placeId, lat: a.lat, lng: a.lng, stateCode: null }).name }))}
        contacts={contacts.map((c) => ({ id: c.id, name: c.name, phone: (tryDecrypt(c.phoneEnc) ?? "").replace(/^\+91/, "+91 ") }))}
      />
    </div>
  )
}
