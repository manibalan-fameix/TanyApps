import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ProductLogo } from "@/components/logo"
import { SiteShell } from "@/components/site/site-shell"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminUrl, publicRootDomain } from "@/lib/env"
import { TRIAL_DAYS } from "@/lib/plans"
import { PRODUCT_STORY, productForIndustry } from "@/lib/products"
import { verticalList } from "@/lib/verticals"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Tany | Online pages and software for local businesses",
  description: "Software for car dealers, restaurants, cab operators and shops in India: your own web page to show what you offer and take enquiries, orders and bookings.",
}

const STEPS = [
  { title: "Create your account", body: "Sign in, choose your type of business and enter its name and contact number." },
  { title: "Add what you offer", body: "List your cars, dishes, vehicles or products with photos and prices." },
  { title: "Share your link", body: "Send your page on WhatsApp and Instagram, then manage what comes in from one dashboard." },
]

export default function Home() {
  return (
    <SiteShell>
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 sm:py-28">
        <Badge variant="secondary">Software for local businesses in India</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Your business online, on <span className="text-primary">your own link</span>
        </h1>
        <p className="text-lg text-pretty text-muted-foreground">
          Tany gives car dealers, restaurants, cab operators and shops their own web page and a dashboard to manage enquiries, orders and bookings.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {/* Plain anchor: the admin app is on another subdomain. */}
          <a href={adminUrl("/login")} className={buttonVariants({ size: "lg" })}>
            Get started
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
          </a>
          <Link href="/pricing" className={buttonVariants({ size: "lg", variant: "outline" })}>
            See pricing
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {TRIAL_DAYS}-day free trial on paid plans. Your page looks like yourbusiness.{publicRootDomain()}
        </p>
      </section>

      <section aria-labelledby="products" className="border-y bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
          <h2 id="products" className="text-center text-3xl font-semibold tracking-tight">
            One platform, built for your kind of business
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {verticalList.map((v) => {
              const product = productForIndustry(v.key)
              return (
                <Card key={v.key}>
                  <CardHeader>
                    <ProductLogo product={v.key} className="mb-2 h-8 self-start justify-self-start" />
                    <CardTitle className="sr-only">{product.name}</CardTitle>
                    <CardDescription>{v.blurb}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-2">
                      {/* The last caption of each story is a slogan about fees; the website lists features only. */}
                      {PRODUCT_STORY[product.key].slice(0, 3).map((line) => (
                        <li key={line} className="flex gap-2">
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-primary" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
        <h2 id="how" className="text-center text-3xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Card className="h-full">
                <CardHeader>
                  <Badge className="mb-2">{i + 1}</Badge>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.body}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to put your business online?</h2>
          <p>Have a question first? Write to us and we will help you pick a plan.</p>
          <Link href="/contact" className={cn(buttonVariants({ size: "lg", variant: "secondary" }))}>
            Contact us
          </Link>
        </div>
      </section>
    </SiteShell>
  )
}
