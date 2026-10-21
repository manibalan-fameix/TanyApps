import type { FareLine } from "./fare"
import { bookingMessage } from "./booking-copy"
import type { Lang } from "./lang"

/**
 * The fare engine writes its line labels in English. For a customer reading Tamil, this swaps the known ones for Tamil and leaves
 * anything it does not recognise (an operator's own surcharge name, a tax line like "CGST 2.5%") as written.
 */
export function localizeLine(line: Pick<FareLine, "key" | "label" | "detail">, lang: Lang): { label: string; detail?: string } {
  if (lang === "en") return { label: line.label, detail: line.detail }
  const m = (k: Parameters<typeof bookingMessage>[1], params: Record<string, string> = {}) => bookingMessage(lang, k, params)

  let label = line.label
  switch (line.key) {
    case "base": label = m("line_base"); break
    case "distance": label = m("line_distance"); break
    case "bata": label = m("line_bata"); break
    case "extra_km": label = m("line_extra_km"); break
    case "extra_hours": label = m("line_extra_hours"); break
    case "rounding": label = m("line_rounding"); break
    case "toll_estimate": label = m("line_toll_estimate"); break
    case "discount": label = m("line_coupon", { code: line.label.replace(/^Coupon\s+/, "") }); break
    case "package": {
      const pk = /^(\d+) hr \/ (\d+) km package$/.exec(line.label)
      label = pk ? m("line_package_hours", { hours: pk[1], km: pk[2] }) : m("line_tour")
      break
    }
  }

  let detail = line.detail
  if (detail) {
    const km = /^([\d.,]+) km at (₹[\d.,]+)\/km$/.exec(detail)
    const day = /^(₹[\d.,]+) × (\d+) (day|days)$/.exec(detail)
    const hr = /^(\d+(?:\.\d+)?) hr at (₹[\d.,]+)\/hr$/.exec(detail)
    const pct = /^([\d.]+%) of the fare$/.exec(detail)
    if (km) detail = m("detail_km_at", { km: km[1], rate: km[2] })
    else if (day) detail = m("detail_days", { rate: day[1], n: day[2], unit: m(day[3] === "day" ? "unit_day" : "unit_days") })
    else if (hr) detail = m("detail_hr_at", { n: hr[1], rate: hr[2] })
    else if (pct) detail = m("detail_pct_of_fare", { pct: pct[1] })
  }
  return { label, detail }
}
