import { redirect } from "next/navigation"

import { SuperLoginForm } from "@/components/super/super-login-form"
import { isAuthConfigured } from "@/lib/auth"
import { getFirebaseWebConfig } from "@/lib/auth/firebase"
import {
  defaultLocalLoginEmail,
  isLocalPasswordLoginEnabled,
} from "@/lib/auth/local-login"
import { currentSuperAdmin } from "@/lib/super/guard"

export const metadata = {
  title: "Super admin sign in",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

export default async function SuperLoginPage() {
  if (await currentSuperAdmin()) redirect("/super")
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <SuperLoginForm
          config={isAuthConfigured() ? getFirebaseWebConfig() : null}
          localEmail={
            isLocalPasswordLoginEnabled() ? defaultLocalLoginEmail() : undefined
          }
        />
      </div>
    </main>
  )
}
