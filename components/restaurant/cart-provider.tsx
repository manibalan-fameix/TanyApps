"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type CartLine = { itemId: string; name: string; portion: string | null; price: number; qty: number }

type Cart = {
  lines: CartLine[]
  count: number
  subtotal: number
  add: (line: Omit<CartLine, "qty">, qty?: number) => void
  setQty: (itemId: string, portion: string | null, qty: number) => void
  clear: () => void
}

const CartContext = createContext<Cart | null>(null)
const MAX_QTY = 20

const same = (a: { itemId: string; portion: string | null }, b: { itemId: string; portion: string | null }) =>
  a.itemId === b.itemId && a.portion === b.portion

/** The guest's cart, kept in this browser only (one per restaurant). The server re-prices everything at checkout. */
export function CartProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const key = `tany-cart:${slug}`
  const [lines, setLines] = useState<CartLine[]>([])
  const [loaded, setLoaded] = useState(false)

  // Read after mount (not in the initial state) so the server and first client render match.
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "[]")
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(raw)) setLines(raw.filter((l) => l && typeof l.itemId === "string" && l.qty > 0))
    } catch {
      // Storage blocked or corrupt: start with an empty cart.
    }
    setLoaded(true)
  }, [key])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(key, JSON.stringify(lines))
    } catch {
      // Private mode: the cart still works for this visit.
    }
  }, [key, lines, loaded])

  const add = useCallback((line: Omit<CartLine, "qty">, qty = 1) => {
    setLines((all) => {
      const i = all.findIndex((l) => same(l, line))
      if (i === -1) return [...all, { ...line, qty: Math.min(MAX_QTY, qty) }]
      return all.map((l, j) => (j === i ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l))
    })
  }, [])
  const setQty = useCallback((itemId: string, portion: string | null, qty: number) => {
    setLines((all) =>
      qty <= 0
        ? all.filter((l) => !same(l, { itemId, portion }))
        : all.map((l) => (same(l, { itemId, portion }) ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
    )
  }, [])
  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<Cart>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + l.qty * l.price, 0),
      add,
      setQty,
      clear,
    }),
    [lines, add, setQty, clear],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): Cart {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used inside CartProvider")
  return ctx
}
