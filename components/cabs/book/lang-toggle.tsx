"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { bookingText } from "@/lib/cabs/booking-copy"
import type { Lang } from "@/lib/cabs/lang"

/** Switches between English and Tamil. The choice is a cookie, so every page (and the login) follows it. */
export function LangToggle({ lang }: { lang: Lang }) {
  const router = useRouter()
  const next: Lang = lang === "en" ? "ta" : "en"
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      lang={next}
      onClick={() => {
        document.cookie = `tany_lang=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
        router.refresh()
      }}
    >
      {bookingText(lang).otherLanguage}
    </Button>
  )
}
