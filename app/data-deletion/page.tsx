import Link from "next/link"

import { Logo } from "@/components/logo"
import { copy } from "@/lib/copy"

export const metadata = { title: "Data Deletion | " + copy.brand.name }

export default function Page() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 py-12 leading-relaxed">
      <Link href="/" aria-label={copy.brand.name} className="w-fit">
        <Logo className="h-8" />
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Delete your data</h1>
      <p>You can ask {copy.brand.name} to delete your account and the data we received through Google or Facebook sign-in at any time.</p>
      <h2 className="mt-4 text-lg font-semibold">How to request deletion</h2>
      <ol className="list-decimal space-y-1 pl-6">
        <li>Email <a className="underline" href={`mailto:${copy.brand.contactEmail}?subject=Delete my data`}>{copy.brand.contactEmail}</a> from the address on your account, with the subject &ldquo;Delete my data&rdquo;.</li>
        <li>We will confirm your request and delete your account, dealership, cars and sign-in details within 30 days.</li>
      </ol>
      <h2 className="mt-4 text-lg font-semibold">Remove the Facebook connection</h2>
      <p>In Facebook, go to Settings &amp; privacy &rarr; Settings &rarr; Apps and websites, find {copy.brand.name} and choose Remove. This stops Facebook sharing data with us. Email us as above if you also want the data we already hold deleted.</p>
      <p>See our <Link className="underline" href="/privacy">Privacy Policy</Link> for what we collect.</p>
    </main>
  )
}
