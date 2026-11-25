"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"

import { SignOutButton } from "@/components/restaurant/store/sign-out-button"
import { Button } from "@/components/ui/button"

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

export function SettingsForm({ signedIn }: { signedIn: boolean }) {
  const { theme, setTheme } = useTheme()
  // False on the server and during hydration, true after: the saved theme is only known in the browser.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <Button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={mounted && theme === t.value}
              variant={mounted && theme === t.value ? "default" : "outline"}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </section>

      {signedIn ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Security</h2>
          <p className="text-sm text-muted-foreground">Signs you out on every phone and browser where you are logged in.</p>
          <SignOutButton everywhere label="Sign out of all devices" />
        </section>
      ) : null}
    </div>
  )
}
