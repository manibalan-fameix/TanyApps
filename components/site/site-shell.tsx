import Link from "next/link"

import { Logo } from "@/components/logo"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { POLICY_PAGES, SITE_PAGES, company } from "@/lib/company"
import { copy } from "@/lib/copy"
import { adminUrl } from "@/lib/env"
import { cn } from "@/lib/utils"

function FooterLinks({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-2 text-sm">
      <p className="font-medium">{title}</p>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="w-fit text-muted-foreground hover:text-foreground">
          {l.label}
        </Link>
      ))}
    </nav>
  )
}

/** Header and footer shared by every page on the root domain. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label={copy.brand.name}>
            <Logo className="h-8" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {SITE_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}>
                {p.label}
              </Link>
            ))}
            {/* Plain anchor: the admin app is on another subdomain and needs a full document navigation. */}
            <a href={adminUrl("/login")} className={buttonVariants()}>
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <Logo className="h-8 self-start" />
            <p>Online pages and business software for local businesses in India.</p>
            {company.legalName && <p>{company.legalName}</p>}
            {company.address && <p>{company.address}</p>}
            {company.phone && <a href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>}
            <a href={`mailto:${company.email}`}>{company.email}</a>
          </div>
          <FooterLinks title="Company" links={SITE_PAGES} />
          <FooterLinks title="Policies" links={POLICY_PAGES} />
        </div>
        <Separator />
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} {company.legalName || copy.brand.name}
        </p>
      </footer>
    </div>
  )
}
