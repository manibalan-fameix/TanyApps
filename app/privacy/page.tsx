import Link from "next/link"

import { Logo } from "@/components/logo"
import { copy } from "@/lib/copy"

export const metadata = { title: "Privacy Policy | " + copy.brand.name }

export default function Page() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 py-12 leading-relaxed">
      <Link href="/" aria-label={copy.brand.name} className="w-fit">
        <Logo className="h-8" />
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 24 September 2026</p>
      <p>{copy.brand.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) lets used car dealers in India publish their cars on a personal web page and receive enquiries from buyers. This policy explains what we collect and why.</p>
      <h2 className="mt-4 text-lg font-semibold">What we collect</h2>
      <p><strong>Dealers:</strong> your name, email address and profile picture from Google or Facebook sign-in; your dealership name, city and phone number; and the cars you add, including photos, videos, registration details and prices.</p>
      <p><strong>Buyers:</strong> the name, phone number and message you submit when you enquire about a car or book a test drive, and messages you type into the chat assistant.</p>
      <h2 className="mt-4 text-lg font-semibold">How we use it</h2>
      <p>To run your account and showroom page, show your cars to buyers, pass buyer enquiries to the dealer you contacted, read number plates and describe photos with AI, and keep the service secure. We do not sell personal data or use it for advertising.</p>
      <h2 className="mt-4 text-lg font-semibold">Google sign-in</h2>
      <p>We use Google only to verify who you are. We receive your name, email address and profile picture, and nothing else from your Google account.</p>
      <h2 className="mt-4 text-lg font-semibold">Facebook sign-in</h2>
      <p>If you choose Facebook, we use it only to verify who you are. We receive your name, email address (if your account has one) and profile picture, and nothing else from your Facebook account. We do not post to Facebook or read your friends, photos or activity. To remove the connection, see our <Link className="underline" href="/data-deletion">data deletion instructions</Link>.</p>
      <h2 className="mt-4 text-lg font-semibold">Who processes your data</h2>
      <p>We use Cloudflare (hosting and file storage), Neon (database) and Google and Meta (sign-in) and Google Gemini (AI). Car photos and chat messages may be sent to Google&rsquo;s Gemini API to read plates, write descriptions and answer buyer questions. These providers process data only to provide their service to us.</p>
      <h2 className="mt-4 text-lg font-semibold">Retention and your rights</h2>
      <p>We keep your data while your account is active. You can ask us to access, correct or delete your data, or close your account, by emailing us. Deleting your account removes your dealership and cars.</p>
      <h2 className="mt-4 text-lg font-semibold">Contact</h2>
      <p>Email <a className="underline" href={`mailto:${copy.brand.contactEmail}`}>{copy.brand.contactEmail}</a>.</p>

    </main>
  )
}
