import type { CSSProperties } from "react"
import { redirect } from "next/navigation"

import { AddressBook } from "@/components/restaurant/store/address-book"
import { StorePage } from "@/components/restaurant/store/ui"
import { currentCustomer } from "@/lib/core/login/customer"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { savedAddressesFor } from "@/lib/restaurant/saved-address-data"
import { themeToCssVars } from "@/lib/theme/tokens"

export const metadata = { title: "Saved addresses" }
export const dynamic = "force-dynamic"

export default async function AddressesPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer, store } = await restaurantPage(params)
  const customer = await currentCustomer(dealer.id)
  if (!customer) redirect("/api/t/auth/start?next=%2Faddresses")
  const addresses = await savedAddressesFor(dealer.id, customer.id)
  return (
    <StorePage>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Saved addresses</h1>
      <div className="mx-auto w-full max-w-xl">
        <AddressBook initial={addresses} centre={store.serviceArea ? { lat: store.serviceArea.lat, lng: store.serviceArea.lng } : null} themeVars={themeToCssVars(dealer.theme) as CSSProperties} />
      </div>
    </StorePage>
  )
}
