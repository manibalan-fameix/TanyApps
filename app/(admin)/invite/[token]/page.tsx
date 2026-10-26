import Link from "next/link"

import { Logo } from "@/components/logo"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { peekInvite } from "@/lib/tenant/invites"

import { acceptInvitation } from "./actions"

export const metadata = { title: "Team invitation", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

// Opened from the link an owner sends. Nothing happens on opening it: the person signs in with their own account and presses Accept.
export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ result?: string }> }) {
  const { token } = await params
  const { result } = await searchParams
  const session = (await auth()) as { user?: { id?: string } | null } | null
  const signedIn = Boolean(session?.user?.id)
  const invite = await peekInvite(token)

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Logo className="h-9 self-center" />
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{invite ? `Join ${invite.businessName}` : "This invitation cannot be used"}</CardTitle>
            <CardDescription>
              {invite
                ? "You were invited to join as staff. Sign in with the email or mobile number the invitation was sent to, then accept."
                : "It may have expired, been used or been withdrawn, or this account may not be the one it was sent to. Ask the owner for a new invitation."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result === "invalid" ? (
              <p role="alert" className="text-center text-sm text-destructive">
                This invitation cannot be used with this account. Sign in with the email or number it was sent to, or ask for a new one.
              </p>
            ) : null}
            {result === "slow_down" ? (
              <p role="alert" className="text-center text-sm text-destructive">
                Too many attempts. Try again in a few minutes.
              </p>
            ) : null}
            {invite && signedIn ? (
              <form action={acceptInvitation.bind(null, token)}>
                <Button type="submit" className="h-11 w-full text-base">
                  Accept invitation
                </Button>
              </form>
            ) : null}
            {invite && !signedIn ? (
              <>
                <Link href="/login" className={cn(buttonVariants(), "h-11 w-full text-base")}>
                  Sign in to continue
                </Link>
                <p className="text-center text-sm text-muted-foreground">After signing in, open this invitation link again.</p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
