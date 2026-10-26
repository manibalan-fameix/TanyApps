"use client"

import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import {
  inviteTeammate,
  removeTeammate,
  revokeInvitation,
} from "@/app/(admin)/(shell)/settings/team/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Invite someone as staff. The invited person signs in with their own account and accepts; nobody creates an account or sets a
 * password for them. The invitation link is shown once, to copy and send (for example on WhatsApp).
 */
export function InviteTeammate() {
  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState("")
  const [error, setError] = useState("")
  const [link, setLink] = useState("")
  const [pending, start] = useTransition()

  const reset = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setContact("")
      setError("")
      setLink("")
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await inviteTeammate(contact)
      if (res.ok) {
        setError("")
        setLink(res.link)
      } else setError(res.error)
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied.")
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={<Button />}>Invite teammate</DialogTrigger>
      <DialogContent>
        {link ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Invitation ready</DialogTitle>
              <DialogDescription>
                Send this link to {contact}. It works once, only for that email or number, and expires in 7 days. They sign in with their
                own account and accept. This link is shown only now.
              </DialogDescription>
            </DialogHeader>
            <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => reset(false)}>
                Done
              </Button>
              <Button type="button" onClick={copy}>
                Copy link
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Invite a teammate</DialogTitle>
              <DialogDescription>
                Enter their email or mobile number. They get staff access after they sign in with their own account and accept. Staff cannot
                change settings, billing or the team. You never set their password.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="invite-contact">Email or mobile number</Label>
              <Input
                id="invite-contact"
                autoComplete="off"
                placeholder="name@example.com or 98765 43210"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                required
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating..." : "Create invitation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function RevokeInvite({ inviteId, label }: { inviteId: string; label: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Revoke invitation for ${label}`}
      onClick={() =>
        start(async () => {
          const res = await revokeInvitation(inviteId)
          if (res.ok) toast.success("Invitation revoked.")
          else toast.error(res.error)
        })
      }
    >
      Revoke
    </Button>
  )
}

export function RemoveTeammate({
  userId,
  label,
}: {
  userId: string
  label: string
}) {
  const [pending, start] = useTransition()
  const remove = () =>
    start(async () => {
      const res = await removeTeammate(userId)
      if (res.ok) toast.success("Teammate removed.")
      else toast.error(res.error)
    })

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" disabled={pending} />}
      >
        Remove
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will lose access to your dealership straight away.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
