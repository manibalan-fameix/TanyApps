import { isValidElement, type ReactNode } from "react"

/** The words a ready-made cell shows, for searching and sorting it. */
export function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(" ")
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ""
}

/** A cell that is only an amount, count or percentage ("₹1,200", "45%") sorts as a number; anything else sorts as text. */
export function sortValueOf(node: ReactNode): string | number {
  const text = textOf(node).trim()
  const plain = text.replace(/[₹,\s%]/g, "")
  if (plain !== "" && /^-?\d+(\.\d+)?$/.test(plain)) return Number(plain)
  return text === "—" ? "" : text
}
