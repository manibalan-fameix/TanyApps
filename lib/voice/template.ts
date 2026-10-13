import {
  accidentHistoryOptions, availabilityOptions, batteryConditionOptions, bodyTypeOptions, featureOptions, fuelOptions,
  insuranceTypeOptions, locationOptions, protectionPlanOptions, reasonOptions, serviceHistoryOptions, transmissionOptions,
  tyreConditionOptions,
} from "../cars/marketplace.ts"
import { isValidReg, normalizeReg, repairOcrReg } from "../reg.ts"
import { tamilOption } from "./tamil.ts"

// ---------- the template ----------

/** Same categories, same order, as the Marketplace details page (plus the car basics before it). */
export const VOICE_SECTIONS = ["basics", "overview", "pricing", "trust", "condition", "specs", "features", "protection"] as const
export type VoiceSection = (typeof VOICE_SECTIONS)[number]

type Kind =
  | "name" // brand, model, colour: title-cased words
  | "text" // short free text
  | "note" // a sentence
  | "year" | "int" | "money" | "decimal" | "owners" | "km" | "plate" | "rto"
  | "option" // one of a fixed list
  | "bool" // yes / no
  | "multi" // any of a fixed list
  | "list" // free-text entries added one by one

type Def = {
  key: string
  section: VoiceSection
  kind: Kind
  /** Words a dealer says to name this blank, e.g. "colour white". */
  labels: RegExp
  options?: readonly string[]
  /** Extra ways to say an option. */
  synonyms?: [RegExp, string][]
  min?: number
  max?: number
}

const anyOf = (...w: string[]) => new RegExp(`\\b(?:${w.join("|")})\\b`, "gi")

const DEFS = [
  // --- car basics
  { key: "plate", section: "basics", kind: "plate", labels: anyOf("registration number", "reg(?:istration)? no\\.?", "reg number", "number plate", "plate(?: number)?", "vehicle number") },
  { key: "make", section: "basics", kind: "name", labels: anyOf("brand", "make", "company", "manufacturer") },
  { key: "model", section: "basics", kind: "name", labels: anyOf("model") },
  { key: "variant", section: "basics", kind: "name", labels: anyOf("variant") },
  { key: "year", section: "basics", kind: "year", labels: anyOf("year", "model year") },
  { key: "owners", section: "basics", kind: "owners", labels: anyOf("number of owners", "owners", "ownership") },
  { key: "km", section: "basics", kind: "km", labels: anyOf("km driven", "kilomet(?:re|er)s? driven", "kms? driven", "odometer", "driven") },
  {
    key: "fuel", section: "basics", kind: "option", options: fuelOptions, labels: anyOf("fuel(?: type)?"),
    synonyms: [[/\bgas\b|c n g/, "CNG"], [/gasoline/, "Petrol"], [/\bev\b|battery/, "Electric"], [/l p g/, "LPG"]],
  },
  {
    key: "transmission", section: "basics", kind: "option", options: transmissionOptions, labels: anyOf("transmission", "gearbox"),
    synonyms: [[/dual clutch/, "DCT"], [/torque converter/, "Torque Converter"], [/\bauto(matic)?\b|\bat\b/, "Automatic"], [/\bgear|stick shift|clutch|\bmt\b/, "Manual"]],
  },
  { key: "colour", section: "basics", kind: "name", labels: anyOf("colou?r") },
  { key: "price", section: "basics", kind: "money", min: 10_000, max: 50_000_000, labels: anyOf("asking price", "expected price", "selling price", "price") },

  // --- car overview
  { key: "makeYear", section: "overview", kind: "text", labels: anyOf("make year", "made in", "manufacturing year", "manufactured in") },
  { key: "registrationYear", section: "overview", kind: "text", labels: anyOf("registration year", "registered in", "year of registration") },
  {
    key: "insurance", section: "overview", kind: "option", options: insuranceTypeOptions, labels: anyOf("insurance(?: type)?"),
    synonyms: [
      [/third party|3rd party|liability/, "Third Party"], [/zero dep/, "Zero Dep"], [/\bfull\b|own damage|\bcomp\b/, "Comprehensive"],
      [/lapsed|not valid|ran out/, "Expired"], [/\bnone\b|no insurance|\bnil\b|\bnot\b|^no\b/, "Not Available"],
    ],
  },
  { key: "rto", section: "overview", kind: "rto", labels: anyOf("rto", "r t o") },
  { key: "location", section: "overview", kind: "text", options: locationOptions, labels: anyOf("location", "located at", "car is at", "parked at", "city") },
  {
    key: "bodyType", section: "overview", kind: "option", options: bodyTypeOptions, labels: anyOf("body(?: type| style)?"),
    synonyms: [
      [/\bsuv\b|s u v|crossover/, "SUV"], [/\bmuv\b|\bmpv\b|people mover/, "MUV"], [/\bpick ?up\b|truck/, "Pickup"], [/\bhatch/, "Hatchback"],
      [/\bsaloon|\bnotchback/, "Sedan"], [/cabriolet|open top/, "Convertible"],
    ],
  },

  // --- EMI and booking
  { key: "emiStart", section: "pricing", kind: "money", min: 0, max: 100_000_000, labels: anyOf("emi starting from", "emi starts from", "monthly emi", "emi") },
  { key: "loanAmount", section: "pricing", kind: "money", min: 0, max: 100_000_000, labels: anyOf("loan amount", "loan") },
  { key: "downPayment", section: "pricing", kind: "money", min: 0, max: 100_000_000, labels: anyOf("down ?payment") },
  { key: "loanDurationMonths", section: "pricing", kind: "int", min: 1, max: 120, labels: anyOf("loan duration", "tenure", "duration") },
  { key: "interestRate", section: "pricing", kind: "decimal", min: 0, max: 100, labels: anyOf("interest rate", "rate of interest", "interest") },
  { key: "bookingAmount", section: "pricing", kind: "money", min: 0, max: 100_000_000, labels: anyOf("booking amount", "token amount", "booking", "token") },
  { key: "tokenRefundable", section: "pricing", kind: "bool", labels: anyOf("booking token refundable", "token refundable", "refundable") },
  {
    key: "availability", section: "pricing", kind: "option", options: availabilityOptions, labels: anyOf("availability", "status"),
    synonyms: [[/coming soon|arriving|expected/, "Upcoming"], [/reserved|on hold/, "Booked"]],
  },

  // --- inspection and trust
  { key: "inspectionScore", section: "trust", kind: "int", min: 0, max: 300, labels: anyOf("inspection score", "score") },
  {
    key: "serviceHistory", section: "trust", kind: "option", options: serviceHistoryOptions, labels: anyOf("service history"),
    synonyms: [
      [/\bpartial\b|some/, "Partial service history"], [/dealer|company|authori[sz]ed/, "Dealer maintained"],
      [/not available|no service|none|\bnil\b|^no\b|no record/, "Not available"], [/\bfull\b|complete|all services|regular|all records|^yes\b|available/, "Full service history"],
    ],
  },
  { key: "inspectionSummary", section: "trust", kind: "note", labels: anyOf("inspection summary", "summary") },
  {
    key: "accidentHistory", section: "trust", kind: "option", options: accidentHistoryOptions, labels: anyOf("accident history", "accidents?"),
    synonyms: [
      [/no accident|non[- ]?accident|accident[- ]free|never (met|had)|^no\b|^nope|nothing|\bclean\b|\bnil\b|\bnone\b/, "No accident history"],
      [/\bminor\b/, "Minor repairs"], [/\bmajor\b/, "Major repair disclosed"], [/not known|don'?t know|unknown|not sure/, "Not known"],
    ],
  },
  { key: "reasonsToBuy", section: "trust", kind: "multi", options: reasonOptions, labels: anyOf("reasons to buy", "reason to buy", "reasons?") },
  { key: "warrantyAvailable", section: "trust", kind: "bool", labels: anyOf("warranty available", "warranty") },
  { key: "floodAffected", section: "trust", kind: "bool", labels: anyOf("flood affected", "flood damage", "flood") },

  // --- condition
  {
    key: "tyreCondition", section: "condition", kind: "option", options: tyreConditionOptions, labels: anyOf("tyre condition", "tyres?", "tires?"),
    synonyms: [[/\bnew\b|brand new|like new/, "Excellent"], [/\bok(ay)?\b|fair|average|medium|half/, "Average"], [/worn|bald|replace|bad|poor/, "Needs replacement"]],
  },
  {
    key: "batteryCondition", section: "condition", kind: "option", options: batteryConditionOptions, labels: anyOf("battery condition", "battery"),
    synonyms: [[/\bnew\b|brand new|like new/, "Excellent"], [/\bok(ay)?\b|fair|average|medium/, "Average"], [/weak|dead|replace|bad|poor/, "Needs replacement"]],
  },
  { key: "dentNotes", section: "condition", kind: "note", labels: anyOf("dents and scratches", "dent notes", "dents?", "scratch(?:es)?") },
  { key: "exteriorNotes", section: "condition", kind: "note", labels: anyOf("exterior notes") },
  { key: "panelIssues", section: "condition", kind: "list", labels: anyOf("panel issues?", "panel") },

  // --- specifications
  { key: "engineCc", section: "specs", kind: "text", labels: anyOf("engine capacity", "engine cc", "engine") },
  { key: "bootSpace", section: "specs", kind: "text", labels: anyOf("boot space", "boot", "luggage") },
  { key: "seatingCapacity", section: "specs", kind: "text", labels: anyOf("seating capacity", "seating", "seats?") },
  { key: "mileage", section: "specs", kind: "text", labels: anyOf("mileage", "fuel efficiency") },
  { key: "groundClearance", section: "specs", kind: "text", labels: anyOf("ground clearance", "clearance") },

  // --- features
  { key: "safety", section: "features", kind: "multi", options: featureOptions.safety, labels: anyOf("safety features", "safety") },
  { key: "comfort", section: "features", kind: "multi", options: featureOptions.comfort, labels: anyOf("comfort features", "comfort") },
  { key: "exterior", section: "features", kind: "multi", options: featureOptions.exterior, labels: anyOf("exterior features", "exterior") },
  { key: "interior", section: "features", kind: "multi", options: featureOptions.interior, labels: anyOf("interior features", "interior") },
  { key: "infotainment", section: "features", kind: "multi", options: featureOptions.infotainment, labels: anyOf("infotainment features", "infotainment", "entertainment") },

  // --- protection plans
  { key: "protectionPlans", section: "protection", kind: "multi", options: protectionPlanOptions, labels: anyOf("protection plans?", "protection", "plans") },
] as const satisfies readonly Def[]

export type VoiceField = (typeof DEFS)[number]["key"]
export const VOICE_FIELDS = DEFS.map((d) => d.key) as VoiceField[]
export const FIELD_DEF = Object.fromEntries(DEFS.map((d) => [d.key, d])) as unknown as Record<VoiceField, Def>
export const sectionFields = (s: VoiceSection) => VOICE_FIELDS.filter((f) => FIELD_DEF[f].section === s)

export type VoiceValue = string | number | boolean | string[]
export type VoiceValues = Partial<Record<VoiceField, VoiceValue>>
export type VoiceParse = { ok: true; value: VoiceValue } | { ok: false }

const OK = (value: VoiceValue): VoiceParse => ({ ok: true, value })
const NO: VoiceParse = { ok: false }

/** Blanks that hold several answers, added to as the dealer keeps speaking. */
export const isListField = (f: VoiceField) => FIELD_DEF[f].kind === "multi" || FIELD_DEF[f].kind === "list"

// ---------- numbers ----------

const WORD_NUMBERS: Record<string, number> = {
  one: 1, first: 1, single: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5,
}

/** "45,000", "45 thousand", "1.2 lakh", "8k". Returns null when there is no number at all. */
export function spokenNumber(text: string, bareUnit?: "lakh" | "thousand"): number | null {
  const m = text.toLowerCase().replace(/(\d),(?=\d)/g, "$1").match(/(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|l\b|thousand|k\b|crores?|cr\b)?/)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2]
  if (!unit) return bareUnit === "lakh" && n < 1000 ? Math.round(n * 100_000) : bareUnit === "thousand" && n < 1000 ? Math.round(n * 1000) : n
  if (/^(lakh|lac|l)/.test(unit)) return Math.round(n * 100_000)
  if (/^(thousand|k)/.test(unit)) return Math.round(n * 1000)
  return Math.round(n * 10_000_000)
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const isNumWord = (w: string) => w in UNITS || w in TENS || w === "hundred" || w === "thousand" || w === "point"

const runValue = (run: string[]): string | null => {
  // Digits read one by one: "one two three four" -> 1234, "six point five" -> 6.5.
  const p = run.indexOf("point")
  if (p > 0 && p < run.length - 1) {
    const whole = runValue(run.slice(0, p))
    const frac = run.slice(p + 1).map((w) => UNITS[w])
    return whole && frac.every((d) => d !== undefined && d <= 9) ? `${whole}.${frac.join("")}` : null
  }
  if (run.includes("point")) return null
  if (run.length > 1 && run.every((w) => w in UNITS && UNITS[w] <= 9)) return run.map((w) => UNITS[w]).join("")
  // Years: "twenty nineteen", "twenty twenty two", "nineteen ninety five".
  if ((run[0] === "twenty" || run[0] === "nineteen") && run.length > 1 && !run.includes("hundred") && !run.includes("thousand")) {
    const rest = runValue(run.slice(1))
    const r = rest === null ? NaN : Number(rest)
    if (r >= 10 && r <= 99 && (run[0] === "nineteen" ? r >= 50 : r <= 39)) return String((run[0] === "nineteen" ? 1900 : 2000) + r)
  }
  let total = 0
  let cur = 0
  for (const w of run) {
    if (w in UNITS) cur += UNITS[w]
    else if (w in TENS) cur += TENS[w]
    else if (w === "hundred") cur = (cur || 1) * 100
    else if (w === "thousand") {
      total += (cur || 1) * 1000
      cur = 0
    }
  }
  return String(total + cur)
}

/** "forty five thousand" -> "45000", "twenty nineteen" -> "2019", "six point five lakh" -> "6.5 lakh". Speech engines often give digits already; this covers the ones that do not. */
export function spokenToDigits(text: string): string {
  const words = text.split(/(\s+)/)
  const out: string[] = []
  for (let i = 0; i < words.length; ) {
    const w = words[i].toLowerCase().replace(/[.,]$/, "")
    if (words[i].trim() && isNumWord(w) && w !== "point") {
      let j = i
      let end = i
      const run: string[] = []
      while (j < words.length) {
        const x = words[j].toLowerCase().replace(/[.,]$/, "")
        if (!words[j].trim()) {
          j++
          continue
        }
        if (!isNumWord(x) && !(x === "oh" && run.length > 0)) break
        run.push(x === "oh" ? "zero" : x)
        j++
        end = j
      }
      // "45 thousand" already has its number: leave the unit for the number reader.
      const prev = out.filter((x) => x.trim()).at(-1)
      const unitOnly = run.length === 1 && (run[0] === "thousand" || run[0] === "hundred") && prev !== undefined && /^\d[\d,.]*$/.test(prev)
      const v = unitOnly ? null : runValue(run)
      if (v !== null) {
        out.push(v)
        i = end
        continue
      }
    }
    out.push(words[i])
    i++
  }
  return out.join("")
}

// ---------- parsing one blank ----------

/** Drops the filler people say before the answer ("it is a", "brand is"). */
const stripLead = (s: string) => s.trim().replace(/^(?:it(?:'s| is)|its|this is|the|a|an|is|are|was|of|brand is|make is|model is|colou?r is)\s+/i, "").replace(/[.,!?]+$/g, "").trim()

const titleCase = (s: string) => s.replace(/\b([a-z])([a-z]*)/gi, (_, a: string, b: string) => (b.length <= 1 && a === a.toUpperCase() ? a + b : a.toUpperCase() + b.toLowerCase()))
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Words that mean "leave this one blank". */
export const isSkip = (text: string) => /^(skip|next|pass|not sure|don'?t know|no idea|none)\b/i.test(text.trim())

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** How each option is said aloud, beyond its own name. */
const ALIASES: Record<string, RegExp> = {
  Airbags: /air ?bags?/, ABS: /\babs\b|a b s|anti.?lock/, EBD: /\bebd\b|e b d/, "Rear camera": /(rear|reverse|back).{0,6}camera|parking camera/,
  "Parking sensors": /parking sensors?|\bsensors?\b/, ESP: /\besp\b|e s p|stability/, "Hill hold": /hill (hold|assist)/,
  "Cruise control": /cruise/, "Keyless start": /keyless|push ?button|push start/, "Automatic AC": /auto(matic)? ?(ac|a c|air ?con\w*)|climate/,
  "Rear AC vents": /rear (ac|a c|vents?)/, "Power windows": /(power|electric) windows?/, Sunroof: /sun ?roof|moon ?roof/, "Alloy wheels": /alloys?/,
  "Rain sensing wipers": /rain.{0,8}wip|wipers/, "LED headlights": /\bled\b|head ?(lamps?|lights?)/, "Fog lamps": /\bfog/, "Leather seats": /leather/,
  "Height adjustable seat": /height adjust|adjustable seat/, Armrest: /arm ?rest/, "Ambient lighting": /ambient/,
  Touchscreen: /touch ?screen|infotainment (screen|system)|\bdisplay\b/, "Android Auto": /android auto/, "Apple CarPlay": /car ?play/, Bluetooth: /blue ?tooth/,
  USB: /\busb\b|u s b/, "Steering controls": /steering (mounted )?(controls?|buttons?)/,
  "Assured with warranty": /warranty|assured/, "Single owner": /(single|first|one|1st) (owner|hand)/, "Low kilometres": /low (km|kilomet)/,
  "Non-accidental": /non.?accident|no accident|accident.?free/, "Well maintained": /well.?maintain/, "Recently serviced": /(recently|just|freshly) serviced|fresh service/,
  "New tyres": /new (tyres?|tires?)/, "Top variant": /top (variant|model|end)/,
  "Comprehensive insurance": /comprehensive|insurance/, "Warranty plan": /warranty/, "Periodic service": /periodic|service/,
  "Roadside assistance 24x7": /roadside|\brsa\b|assistance/, "90-day buyback assurance": /buy.?back/, "Maintenance package": /maintenance/,
}

/** An option from a fixed list, matched by its own name, a synonym, or (for spelled initialisms) its letters. */
function pickOption(options: readonly string[], text: string, synonyms: [RegExp, string][] = []): string | null {
  // "a m t" -> "amt", "i m t" -> "imt"
  const t = text.toLowerCase().replace(/\b(?:[a-z]\s){1,3}[a-z]\b/g, (m) => m.replace(/\s/g, ""))
  for (const [re, option] of synonyms) if (re.test(t)) return option
  return options.find((o) => t.includes(o.toLowerCase())) ?? null
}

const pickMany = (options: readonly string[], text: string): string[] => {
  const t = text.toLowerCase()
  const n = ` ${norm(text)} `
  return options.filter((o) => n.includes(` ${norm(o)} `) || ALIASES[o]?.test(t))
}

const inRange = (n: number | null, min: number, max: number) => (n !== null && Number.isFinite(n) && n >= min && n <= max ? n : null)

export function parseVoiceField(field: VoiceField, raw: string, thisYear = new Date().getFullYear()): VoiceParse {
  const def = FIELD_DEF[field]
  const text = raw.trim()
  if (!text) return NO
  switch (def.kind) {
    case "name": {
      const v = stripLead(text)
      return v.length >= 2 && v.length <= 40 ? OK(titleCase(v)) : NO
    }
    case "text": {
      const v = stripLead(text)
      if (!v || v.length > 120) return NO
      // A place from the app's own list keeps its spelling; anything else is taken as said.
      const known = def.options?.find((o) => v.toLowerCase().includes(o.toLowerCase()))
      return OK(known ?? (field === "location" ? titleCase(v) : sentence(v)))
    }
    case "note": {
      const v = text.replace(/^(?:it(?:'s| is)|the)\s+/i, "").trim()
      return v.length >= 2 ? OK(sentence(v).slice(0, 500)) : NO
    }
    case "plate": {
      // Speech gives "T N 11 A B 1234" or "tn 11 ab 1234": drop everything that is not a letter or digit.
      const plate = normalizeReg(repairOcrReg(text.replace(/[^a-z0-9]/gi, "")))
      return isValidReg(plate) ? OK(plate) : NO
    }
    case "rto": {
      const code = text.replace(/[^a-z0-9]/gi, "").toUpperCase()
      return /^[A-Z]{2}\d{1,3}[A-Z]?$/.test(code) ? OK(code) : NO
    }
    case "year": {
      const m = text.match(/\b(19[89]\d|20\d{2})\b/)
      const y = m ? Number(m[1]) : null
      return y && y >= 1990 && y <= thisYear + 1 ? OK(y) : NO
    }
    case "owners": {
      const d = text.match(/\b(\d{1,2})\b/)
      const word = text.toLowerCase().split(/\W+/).map((w) => WORD_NUMBERS[w]).find(Boolean)
      const n = d ? Number(d[1]) : word
      return n && n >= 1 && n <= 10 ? OK(n) : NO
    }
    case "km": {
      const n = inRange(spokenNumber(text, "thousand"), 0, 2_000_000)
      return n === null ? NO : OK(Math.round(n))
    }
    case "money": {
      const n = inRange(spokenNumber(text, field === "price" ? "lakh" : undefined), def.min ?? 0, def.max ?? 100_000_000)
      return n === null ? NO : OK(Math.round(n))
    }
    case "int": {
      // "3 years" is 36 months.
      const years = field === "loanDurationMonths" && /\byears?\b/i.test(text)
      const n = spokenNumber(text)
      const v = inRange(n === null ? null : years ? n * 12 : n, def.min ?? 0, def.max ?? 1_000_000)
      return v === null ? NO : OK(Math.round(v))
    }
    case "decimal": {
      const m = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/)
      const v = m ? inRange(Number(m[0]), def.min ?? 0, def.max ?? 1000) : null
      return v === null ? NO : OK(v)
    }
    case "option": {
      const o = pickOption(def.options ?? [], text, def.synonyms ? [...def.synonyms] : [])
      return o ? OK(o) : NO
    }
    case "bool": {
      const t = text.toLowerCase()
      if (/\b(no|nope|not|never|none|without|non|nothing)\b/.test(t)) return OK(false)
      if (/\b(yes|yeah|yep|sure|true|available|refundable|affected|included|has|have|with|correct|right)\b/.test(t)) return OK(true)
      return NO
    }
    case "multi": {
      const found = pickMany(def.options ?? [], text)
      return found.length ? OK(found) : NO
    }
    case "list": {
      const entries = text.split(/[;\n]+/).map((e) => sentence(e.trim().replace(/[.,]+$/, ""))).filter((e) => e.length >= 2 && e.length <= 200)
      return entries.length ? OK(entries) : NO
    }
  }
}

/** Check a value that came back from the browser. Anything that is not exactly the right shape for its blank is dropped. */
export function validateVoiceValue(field: VoiceField, value: unknown, thisYear = new Date().getFullYear()): VoiceValue | null {
  const def = FIELD_DEF[field]
  if (!def) return null
  const str = (max: number) => (typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null)
  const num = (min: number, max: number, whole = true) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!whole || Number.isInteger(value)) ? value : null
  switch (def.kind) {
    case "name": return str(40)
    case "text": case "rto": return str(120)
    case "note": return str(500)
    case "plate": { const s = str(20); return s && isValidReg(s) ? normalizeReg(s) : null }
    case "year": return num(1990, thisYear + 1)
    case "owners": return num(1, 10)
    case "km": return num(0, 2_000_000)
    case "money": case "int": return num(def.min ?? 0, def.max ?? 100_000_000)
    case "decimal": return num(def.min ?? 0, def.max ?? 100, false)
    case "option": { const s = str(60); return s && def.options?.includes(s) ? s : null }
    case "bool": return typeof value === "boolean" ? value : null
    case "multi": {
      if (!Array.isArray(value)) return null
      const ok = value.filter((v): v is string => typeof v === "string" && !!def.options?.includes(v))
      return ok.length ? [...new Set(ok)] : null
    }
    case "list": {
      if (!Array.isArray(value)) return null
      const ok = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 200).slice(0, 12)
      return ok.length ? ok : null
    }
  }
}

// ---------- one spoken sentence -> blanks ----------

type Mark = { field: VoiceField; start: number; end: number }

/** Every place the dealer names a blank. Where names overlap ("registration year" contains "year"), the longer one wins. */
function findMarks(text: string): Mark[] {
  const all: Mark[] = []
  for (const d of DEFS) for (const m of text.matchAll(new RegExp(d.labels.source, "gi"))) all.push({ field: d.key, start: m.index, end: m.index + m[0].length })
  all.sort((a, b) => b.end - b.start - (a.end - a.start))
  const kept: Mark[] = []
  for (const m of all) if (!kept.some((k) => m.start < k.end && k.start < m.end)) kept.push(m)
  return kept.sort((a, b) => a.start - b.start)
}

// Vague or common words are only trusted for the blank being asked, so these need a telltale word to fill another blank.
const LOOSE: [VoiceField, RegExp | null][] = [
  ["plate", null], ["fuel", null], ["transmission", null], ["bodyType", null],
  ["insurance", /third party|zero dep|comprehensive|expired|lapsed/i], ["accidentHistory", /accident|minor repair|major repair/i],
  ["safety", null], ["comfort", null], ["exterior", null], ["interior", null], ["infotainment", null],
]

/**
 * Turn one spoken sentence into blank-fills.
 *  1. Values that name their own unit: "45,000 km", "first owner", "36 months", "8.5 percent".
 *  2. Named blanks: "colour white, fuel petrol".
 *  3. Loose words only one blank can mean ("petrol", "sunroof", "2019", "6.5 lakh").
 *  4. Nothing recognised: the whole sentence answers the blank currently being asked for.
 * `current` lets list blanks grow (features, reasons) instead of being replaced.
 */
export function extractFromSpeech(raw: string, active: VoiceField, thisYear = new Date().getFullYear(), current: VoiceValues = {}): VoiceValues {
  let text = spokenToDigits(raw.trim())
  const out: VoiceValues = {}
  if (!text) return out

  const take = (field: VoiceField, chunk: string) => {
    const r = parseVoiceField(field, chunk, thisYear)
    if (!r.ok) return false
    const prev = current[field]
    out[field] = Array.isArray(r.value) && Array.isArray(prev) ? [...new Set([...prev, ...r.value])] : r.value
    return true
  }
  const strip = (re: RegExp) => {
    const m = text.match(re)
    if (m) text = text.replace(m[0], " ")
    return m
  }

  // Pass 1: units that name themselves.
  const km = strip(/(\d[\d,.]*\s*(?:k|thousand|lakh|lac)?)\s*(?:km|kms|kilomet(?:re|er)s?)\b(?!\s*(?:per|\/|pl))/i)
  if (km) take("km", km[1])
  // "single owner" inside a list of reasons to buy is a reason, not the owner count.
  const owner = /\breasons?\b/i.test(text) ? null : strip(/\b((?:first|second|third|fourth|fifth|single|\d{1,2}(?:st|nd|rd|th)?)[ -]+(?:owner|hand))\b/i)
  if (owner) take("owners", owner[1])
  const months = strip(/\b(\d{1,3})\s*months?\b/i)
  if (months) take("loanDurationMonths", months[1])
  const pct = strip(/(\d+(?:\.\d+)?)\s*(?:%|per ?cent)/i)
  if (pct) take("interestRate", pct[1])

  // Pass 2: named blanks, each taking the words up to the next name.
  const marks = findMarks(text)
  const named = new Set<VoiceField>()
  marks.forEach((mark, i) => {
    const chunk = text.slice(mark.end, marks[i + 1]?.start ?? text.length).replace(/^\W*(?:is|are|was|of|as|at|in|for)?\W+/i, "").trim()
    if (chunk) {
      if (take(mark.field, chunk)) named.add(mark.field)
    } else if (FIELD_DEF[mark.field].kind === "bool") {
      // "flood affected" on its own says yes, unless it was said as "not flood affected".
      out[mark.field] = !/\b(no|not|never|non|without)\W*$/i.test(text.slice(Math.max(0, mark.start - 14), mark.start))
      named.add(mark.field)
    }
  })
  const rest = marks.length ? text.slice(0, marks[0].start) : text

  // Pass 3: loose words.
  const price = rest.match(/(?:₹|rs\.?\s*|rupees\s*)?(\d[\d,.]*\s*(?:lakhs?|lacs?|crores?))\b/i)
  if (price && out.price === undefined && !named.has("price")) take("price", price[1])
  for (const [f, guard] of LOOSE) if (out[f] === undefined && !named.has(f) && (f === active || !guard || guard.test(rest))) take(f, rest)
  if (out.year === undefined && !named.has("year")) take("year", rest)

  // Pass 4: nothing matched, so it answers the blank being asked for.
  if (Object.keys(out).length === 0) take(active, spokenToDigits(raw))
  return out
}

// ---------- showing values ----------

const ordinal = (n: number) => (n === 1 ? "1st owner" : n === 2 ? "2nd owner" : n === 3 ? "3rd owner" : `${n}th owner`)
const ordinalTa = (n: number) => (n === 1 ? "முதல் உரிமையாளர்" : `${n}-வது உரிமையாளர்`)

/** How a value reads on screen. Fixed-list choices keep their English value but can be shown in Tamil. */
export function formatVoiceValue(field: VoiceField, value: VoiceValue, locale: "en" | "ta" | "tg" = "en"): string {
  const kind = FIELD_DEF[field].kind
  const ta = locale === "ta"
  const tr = (s: string) => (ta && kind !== "list" && kind !== "note" ? tamilOption(s) : s)
  if (typeof value === "boolean") return locale === "tg" ? (value ? "Aama" : "Illa") : tr(value ? "Yes" : "No")
  if (Array.isArray(value)) return value.map(tr).join(kind === "list" ? "; " : ", ")
  if (kind === "owners") return typeof value === "number" ? (ta ? ordinalTa(value) : locale === "tg" ? (value === 1 ? "Mudhal owner" : `${value}-vadhu owner`) : ordinal(value)) : String(value)
  if (kind === "km") return `${Number(value).toLocaleString("en-IN")} ${ta ? "கி.மீ" : "km"}`
  if (kind === "money") return `₹${Number(value).toLocaleString("en-IN")}`
  if (field === "interestRate") return `${value}%`
  if (field === "loanDurationMonths") return ta ? `${value} மாதங்கள்` : `${value} months`
  return tr(String(value))
}

/** What goes back into the box when the dealer taps a blank to edit it. */
export function editableText(field: VoiceField, value: VoiceValue | undefined): string {
  if (value === undefined) return ""
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (Array.isArray(value)) return value.join(FIELD_DEF[field].kind === "list" ? "; " : ", ")
  return String(value)
}
