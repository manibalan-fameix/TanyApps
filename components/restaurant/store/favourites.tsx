"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { FavouriteIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

type Favourites = { ids: string[]; has: (id: string) => boolean; toggle: (id: string) => void }
const Ctx = createContext<Favourites | null>(null)

/** Dishes a guest has hearted. Kept in this browser only, one list per restaurant. */
export function FavouritesProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const key = `tany-fav:${slug}`
  const [ids, setIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  // Read after mount (not in the initial state) so the server and first client render match.
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "[]")
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(raw)) setIds(raw.filter((v): v is string => typeof v === "string"))
    } catch {
      // Storage blocked or corrupt: start empty.
    }
    setLoaded(true)
  }, [key])
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(key, JSON.stringify(ids))
    } catch {
      // Private mode: favourites last for this visit only.
    }
  }, [key, ids, loaded])

  const toggle = useCallback((id: string) => setIds((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id])), [])
  const value = useMemo<Favourites>(() => ({ ids, has: (id) => ids.includes(id), toggle }), [ids, toggle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFavourites(): Favourites {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useFavourites must be used inside FavouritesProvider")
  return ctx
}

export function FavouriteButton({ dishId, name, className }: { dishId: string; name: string; className?: string }) {
  const fav = useFavourites()
  const on = fav.has(dishId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      onClick={() => fav.toggle(dishId)}
      className={cn("inline-flex size-8 items-center justify-center rounded-full bg-background/90 transition-colors hover:bg-background", className)}
    >
      <HugeiconsIcon icon={FavouriteIcon} strokeWidth={2} className={cn("size-4", on ? "fill-primary text-primary" : "text-muted-foreground")} />
    </button>
  )
}
