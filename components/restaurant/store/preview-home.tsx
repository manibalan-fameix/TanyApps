"use client"

import { useEffect, useState } from "react"

import { HomeScreens } from "@/components/restaurant/store/home-screens"
import { allSections, homepageSchema } from "@/lib/restaurant/homepage"

export const PREVIEW_READY = "homepage-preview-ready"
export const PREVIEW_DRAFT = "homepage-preview-draft"

/** The home screens inside the editor's frame: they take the layout being edited, and their links lead nowhere. */
export function PreviewHome(props: React.ComponentProps<typeof HomeScreens>) {
  const [layout, setLayout] = useState(props.layout)

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      // Only the editor that holds this frame, on this same site, may change what it shows.
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== PREVIEW_DRAFT) return
      const draft = homepageSchema.safeParse(event.data.layout)
      if (draft.success) setLayout({ ...draft.data, sections: allSections(draft.data.sections) })
    }
    window.addEventListener("message", receive)
    window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin)

    // A store link would open an admin address from here, so following links and searching are switched off.
    const stay = (event: Event) => {
      if (event.type === "submit" || (event.target as Element | null)?.closest?.("a[href]")) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener("click", stay, true)
    document.addEventListener("submit", stay, true)
    return () => {
      window.removeEventListener("message", receive)
      document.removeEventListener("click", stay, true)
      document.removeEventListener("submit", stay, true)
    }
  }, [])

  return <HomeScreens {...props} layout={layout} />
}
