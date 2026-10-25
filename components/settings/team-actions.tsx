"use client"

import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import {
  addTeammate,
  removeTeammate,
  resetTeammatePassword,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function AddTeammate() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("staff")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await addTeammate({ name, email, phone, password, role })
      if (res.ok) {
        toast.success("Teammate added.")
        setName("")
        setEmail("")
        setPhone("")
        setPassword("")
        setError("")
        setOpen(false)
      } else setError(res.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add teammate</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a teammate</DialogTitle>
            <DialogDescription>
              They log in with this email and the password you set here, and get
              staff access to your dealership. Share the password with them
              yourself. Staff cannot change settings, billing or the team.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="teammate-name">Name</Label>
            <Input
              id="teammate-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="teammate-email">Email</Label>
            <Input
              id="teammate-email"
              type="email"
              autoComplete="off"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="teammate-phone">Mobile number</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">+91</span>
              <Input
                id="teammate-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="teammate-role">Role</Label>
            <Select value={role} onValueChange={(v) => v && setRole(v)}>
              <SelectTrigger id="teammate-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="owner" disabled>
                  Owner (cannot be shared)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="teammate-password">Password</Label>
            <Input
              id="teammate-password"
              type="text"
              autoComplete="off"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                pending || !name || !email || !phone || password.length < 8
              }
            >
              {pending ? "Adding..." : "Add teammate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

export function ResetPassword({
  userId,
  label,
}: {
  userId: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await resetTeammatePassword(userId, password)
      if (res.ok) {
        toast.success("Password updated.")
        setPassword("")
        setError("")
        setOpen(false)
      } else setError(res.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Set password
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New password for {label}</DialogTitle>
            <DialogDescription>
              Their old password stops working. Share the new one with them
              yourself.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reset-password">Password</Label>
            <Input
              id="reset-password"
              type="text"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || password.length < 8}>
              {pending ? "Saving..." : "Save password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
