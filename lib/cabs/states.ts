/**
 * Indian states and union territories: the two-letter code used for permits (TN, AP), the two-digit GST state code that
 * decides CGST + SGST versus IGST, and the name. The GST codes are the ones on the GST portal's state list; check them
 * against the portal before relying on a rarely used one (see docs/tanycabs/DECISIONS.md).
 */
export type IndianState = { code: string; gst: string; name: string }

export const STATES: readonly IndianState[] = [
  { code: "JK", gst: "01", name: "Jammu and Kashmir" },
  { code: "HP", gst: "02", name: "Himachal Pradesh" },
  { code: "PB", gst: "03", name: "Punjab" },
  { code: "CH", gst: "04", name: "Chandigarh" },
  { code: "UK", gst: "05", name: "Uttarakhand" },
  { code: "HR", gst: "06", name: "Haryana" },
  { code: "DL", gst: "07", name: "Delhi" },
  { code: "RJ", gst: "08", name: "Rajasthan" },
  { code: "UP", gst: "09", name: "Uttar Pradesh" },
  { code: "BR", gst: "10", name: "Bihar" },
  { code: "SK", gst: "11", name: "Sikkim" },
  { code: "AR", gst: "12", name: "Arunachal Pradesh" },
  { code: "NL", gst: "13", name: "Nagaland" },
  { code: "MN", gst: "14", name: "Manipur" },
  { code: "MZ", gst: "15", name: "Mizoram" },
  { code: "TR", gst: "16", name: "Tripura" },
  { code: "ML", gst: "17", name: "Meghalaya" },
  { code: "AS", gst: "18", name: "Assam" },
  { code: "WB", gst: "19", name: "West Bengal" },
  { code: "JH", gst: "20", name: "Jharkhand" },
  { code: "OD", gst: "21", name: "Odisha" },
  { code: "CG", gst: "22", name: "Chhattisgarh" },
  { code: "MP", gst: "23", name: "Madhya Pradesh" },
  { code: "GJ", gst: "24", name: "Gujarat" },
  { code: "DD", gst: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "MH", gst: "27", name: "Maharashtra" },
  { code: "KA", gst: "29", name: "Karnataka" },
  { code: "GA", gst: "30", name: "Goa" },
  { code: "LD", gst: "31", name: "Lakshadweep" },
  { code: "KL", gst: "32", name: "Kerala" },
  { code: "TN", gst: "33", name: "Tamil Nadu" },
  { code: "PY", gst: "34", name: "Puducherry" },
  { code: "AN", gst: "35", name: "Andaman and Nicobar Islands" },
  { code: "TG", gst: "36", name: "Telangana" },
  { code: "AP", gst: "37", name: "Andhra Pradesh" },
  { code: "LA", gst: "38", name: "Ladakh" },
]

/** Spellings Google and older documents use for the same state. */
const ALIASES: Record<string, string> = { TS: "TG", OR: "OD", UT: "UK", UA: "UK", DN: "DD" }

/** A state from a two-letter code, a GST code or a name, in any case. Null for anything unrecognised. */
export function findState(value: string | null | undefined): IndianState | null {
  const v = (value ?? "").trim()
  if (!v) return null
  const upper = v.toUpperCase()
  const code = ALIASES[upper] ?? upper
  const byCode = STATES.find((s) => s.code === code || s.gst === v)
  if (byCode) return byCode
  const lower = v.toLowerCase()
  return STATES.find((s) => s.name.toLowerCase() === lower) ?? null
}
