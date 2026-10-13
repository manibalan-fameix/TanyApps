"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { readRecentOrders } from "@/lib/restaurant/recent-orders"

export function TrackForm() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readRecentOrders())
  }, [])
  return (
    <div className="grid max-w-xl gap-6">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const clean = code.trim().toUpperCase()
          if (!/^[A-Z0-9]{6}$/.test(clean)) return setError("Enter the 6-character code from your order.")
          router.push(`/o/${clean}`)
        }}
      >
        <label htmlFor="track-code" className="text-sm font-medium">Order code</label>
        <div className="flex gap-2">
          <Input id="track-code" value={code} placeholder="e.g. 7KQ4MX" autoCapitalize="characters" maxLength={6} onChange={(e) => { setCode(e.target.value); setError("") }} />
          <Button type="submit">Track</Button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </form>
      {recent.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium">Your recent orders on this device</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {recent.map((c) => (
              <li key={c}><Link href={`/o/${c}`} className="rounded-full border px-4 py-2 font-mono text-sm hover:bg-muted">{c}</Link></li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
