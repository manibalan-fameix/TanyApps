import { Logo } from "@/components/logo"
import { buttonVariants } from "@/components/ui/button"
import { copy } from "@/lib/copy"
import { adminUrl } from "@/lib/env"
import { cn } from "@/lib/utils"

// Marketing placeholder for the root domain.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 p-6">
      <Logo className="h-10 self-start" />
      <h1 className="text-3xl font-semibold tracking-tight">{copy.marketing.heading}</h1>
      <p className="text-muted-foreground">{copy.marketing.body}</p>
      {/* Plain anchor: a cross-origin hop to the admin subdomain must be a full document navigation, not a router/RSC fetch. */}
      <a href={adminUrl("/login")} className={cn(buttonVariants({ size: "lg" }), "w-fit")}>
        {copy.marketing.cta}
      </a>
    </main>
  )
}
