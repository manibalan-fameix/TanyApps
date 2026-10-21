"use client"

import { useEffect } from "react"

/** Keeps a signed-in customer signed in: asks the server to renew a session that is a day old. Does nothing visible. */
export function SessionKeeper() {
  useEffect(() => {
    void fetch("/api/t/auth/session", { method: "POST" }).catch(() => undefined)
  }, [])
  return null
}
