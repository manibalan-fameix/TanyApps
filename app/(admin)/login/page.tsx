import { redirect } from "next/navigation"



import { DealerLoginForm } from "@/components/auth/dealer-login-form"
import { Button } from "@/components/ui/button"
import { copy } from "@/lib/copy"
import { isAuthConfigured } from "@/lib/auth"
import { getDealerContext } from "@/lib/auth/context"
import { openDevDemo } from "@/lib/auth/actions"
import { isDevBypassEnabled } from "@/lib/auth/dev-bypass"
import { getFirebaseWebConfig } from "@/lib/auth/firebase"
import { defaultLocalLoginEmail, isLocalPasswordLoginEnabled } from "@/lib/auth/local-login"

export const metadata = { title: copy.auth.signInTitle }
// Reads env and session at request time; never prerender.
export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const configured = isAuthConfigured()
  const firebaseConfig = getFirebaseWebConfig()
  const bypass = isDevBypassEnabled()
  const localPassword = isLocalPasswordLoginEnabled()
  // Development only: numbers registered as Firebase "phone numbers for testing" (comma separated, 10 digits).
  const testPhones =
    process.env.NODE_ENV === "development" ? (process.env.FIREBASE_TEST_PHONES ?? "").split(",").map((n) => n.trim()).filter(Boolean) : []
  // Only a user who already has a dealership skips login; an unfinished sign-up stays here and signs up.
  if (configured && (await getDealerContext()).status === "ok") redirect("/dashboard")

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <DealerLoginForm config={configured ? firebaseConfig : null} testPhones={testPhones} localEmail={localPassword ? defaultLocalLoginEmail() : undefined} />
        {bypass ? (
          <form action={openDevDemo}>
            <Button type="submit" variant="outline" className="h-11 w-full text-base">
              Open the demo dealer
            </Button>
          </form>
        ) : null}
        {bypass ? (
          <p className="text-center text-sm text-muted-foreground">{copy.auth.devBypass}</p>
        ) : (
          !configured && <p className="text-center text-sm text-muted-foreground">{copy.auth.notConfigured}</p>
        )}
      </div>
    </main>
  )
}
