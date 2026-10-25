"use client"

import { useTheme } from "next-themes"
import { Toaster as Sileo } from "sileo"
import "sileo/styles.css"

// Mounted once per surface layout (admin, super, tenant). Toasts are fired through `@/lib/toast`.
// Admin/super follow next-themes (dark mode); the tenant site has no provider, so it stays on system.
export function Toaster() {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : "system"
  return <Sileo position="top-center" theme={theme} />
}
