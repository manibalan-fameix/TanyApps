/** The contact page with "Request a product" open, and what the customer searched for already filled in. */
export function requestHref(item = ""): string {
  const q = item.trim().slice(0, 80)
  return q ? `/contact?item=${encodeURIComponent(q)}` : "/contact"
}
