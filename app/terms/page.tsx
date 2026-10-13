import Link from "next/link"

import { Logo } from "@/components/logo"
import { copy } from "@/lib/copy"

export const metadata = { title: "Terms of Service | " + copy.brand.name }

export default function Page() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 py-12 leading-relaxed">
      <Link href="/" aria-label={copy.brand.name} className="w-fit">
        <Logo className="h-8" />
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: 24 September 2026</p>
      <p>By using {copy.brand.name} you agree to these terms.</p>
      <h2 className="mt-4 text-lg font-semibold">The service</h2>
      <p>{copy.brand.name} provides tools to list used cars online and receive buyer enquiries. It is not a party to any sale between a dealer and a buyer.</p>
      <h2 className="mt-4 text-lg font-semibold">Your account</h2>
      <p>Sign in with Google and keep your account secure. You are responsible for activity under your account and for the accuracy of what you list: prices, condition, ownership and accident history must be truthful.</p>
      <h2 className="mt-4 text-lg font-semibold">Acceptable use</h2>
      <p>Do not list stolen, misrepresented or unlawful vehicles, upload content you do not have the right to use, or misuse the service, including attempts to disrupt it or access other dealers&rsquo; data.</p>
      <h2 className="mt-4 text-lg font-semibold">Content</h2>
      <p>You keep ownership of the photos and details you upload and give us permission to store and display them to run the service. We may remove listings that break these terms.</p>
      <h2 className="mt-4 text-lg font-semibold">Availability and liability</h2>
      <p>The service is provided as is. We work to keep it available but do not guarantee it will be uninterrupted or error free, and we are not liable for losses arising from sales, enquiries or downtime, to the extent the law allows.</p>
      <h2 className="mt-4 text-lg font-semibold">Changes and contact</h2>
      <p>We may update these terms and will post the new date here. Questions: <a className="underline" href={`mailto:${copy.brand.contactEmail}`}>{copy.brand.contactEmail}</a>.</p>

    </main>
  )
}
