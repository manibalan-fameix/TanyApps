import { describe, expect, it } from "vitest"

import { cleanVoiceValues, readVoiceDraft, voiceDraftTitle, voiceToListing } from "../lib/cars/from-voice"
import { tamilToEnglish, tanglishToEnglish, OPTION_TA } from "../lib/voice/tamil"
import { voiceTa, voiceTg } from "../lib/copy-ta"
import { copy } from "../lib/copy"
import { PLANS } from "../lib/plans"
import { extractFromSpeech, formatVoiceValue, FIELD_DEF, isSkip, parseVoiceField, spokenNumber, spokenToDigits, VOICE_FIELDS, VOICE_SECTIONS } from "../lib/voice/template"

const val = (f: Parameters<typeof parseVoiceField>[0], s: string) => {
  const r = parseVoiceField(f, s, 2026)
  return r.ok ? r.value : null
}

describe("spokenNumber", () => {
  it("reads digits, separators and Indian units", () => {
    expect(spokenNumber("45,000 kilometres")).toBe(45000)
    expect(spokenNumber("45 thousand")).toBe(45000)
    expect(spokenNumber("1.2 lakh")).toBe(120000)
    expect(spokenNumber("about 8k")).toBe(8000)
    expect(spokenNumber("no number")).toBeNull()
  })
})

describe("parseVoiceField", () => {
  it("cleans brand, model and colour", () => {
    expect(val("make", "It's maruti suzuki.")).toBe("Maruti Suzuki")
    expect(val("model", "baleno")).toBe("Baleno")
    expect(val("colour", "the pearl white")).toBe("Pearl White")
  })
  it("reads years in range only", () => {
    expect(val("year", "registered in 2019")).toBe(2019)
    expect(val("year", "2031")).toBeNull()
    expect(val("year", "nineteen")).toBeNull()
  })
  it("reads owners from digits or words", () => {
    expect(val("owners", "2")).toBe(2)
    expect(val("owners", "first owner")).toBe(1)
    expect(val("owners", "single owner")).toBe(1)
    expect(val("owners", "lots")).toBeNull()
  })
  it("treats a small bare km as thousands and a small bare price as lakhs", () => {
    expect(val("km", "45")).toBe(45000)
    expect(val("km", "45,000")).toBe(45000)
    expect(val("price", "6.5 lakh")).toBe(650000)
    expect(val("price", "6")).toBe(600000)
    expect(val("price", "650000")).toBe(650000)
  })
  it("maps to the app's own option lists", () => {
    expect(val("fuel", "petrol")).toBe("Petrol")
    expect(val("transmission", "it is automatic")).toBe("Automatic")
    expect(val("transmission", "manual gearbox")).toBe("Manual")
    expect(val("bodyType", "it's an SUV")).toBe("SUV")
    expect(val("accidentHistory", "no accident")).toBe("No accident history")
    expect(val("serviceHistory", "full")).toBe("Full service history")
    expect(val("transmission", "cvt")).toBe("CVT")
    expect(val("insurance", "third party")).toBe("Third Party")
    expect(val("fuel", "banana")).toBeNull()
  })
  it("recognises skip", () => {
    expect(isSkip("Skip.")).toBe(true)
    expect(isSkip("skipper")).toBe(false)
  })
})

describe("extractFromSpeech", () => {
  it("places a whole sentence into several blanks", () => {
    const v = extractFromSpeech("white Baleno 2019 first owner 45,000 km petrol manual 6.5 lakh", "make", 2026)
    expect(v).toMatchObject({ year: 2019, owners: 1, km: 45000, fuel: "Petrol", transmission: "Manual", price: 650000 })
  })
  it("uses spoken field names", () => {
    const v = extractFromSpeech("brand Maruti Suzuki, model Baleno, colour pearl white, registration number T N 11 A B 1234", "make", 2026)
    expect(v).toMatchObject({ make: "Maruti Suzuki", model: "Baleno", colour: "Pearl White", plate: "TN11AB1234" })
  })
  it("gives a bare answer to the blank being asked for", () => {
    expect(extractFromSpeech("Maruti", "make", 2026)).toEqual({ make: "Maruti" })
    expect(extractFromSpeech("nothing useful 12", "fuel", 2026)).toEqual({})
  })
  it("does not confuse a mileage with a year", () => {
    const v = extractFromSpeech("2019 model 2020 km", "year", 2026)
    expect(v.km).toBe(2020)
  })
})

describe("spokenToDigits", () => {
  it("turns spoken numbers into digits", () => {
    expect(spokenToDigits("forty five thousand")).toBe("45000")
    expect(spokenToDigits("twenty nineteen")).toBe("2019")
    expect(spokenToDigits("twenty twenty two")).toBe("2022")
    expect(spokenToDigits("six point five lakh")).toBe("6.5 lakh")
    expect(spokenToDigits("T N one one A B one two three four")).toBe("T N 11 A B 1234")
    expect(spokenToDigits("twenty five")).toBe("25")
    expect(spokenToDigits("white Baleno")).toBe("white Baleno")
  })
  it("lets spoken numbers fill blanks", () => {
    expect(extractFromSpeech("forty five thousand kilometres", "km", 2026)).toMatchObject({ km: 45000 })
    expect(extractFromSpeech("twenty nineteen", "year", 2026)).toEqual({ year: 2019 })
    expect(extractFromSpeech("six point five lakh", "price", 2026)).toEqual({ price: 650000 })
  })
})

describe("short answers", () => {
  it("understands plain replies for option blanks", () => {
    expect(extractFromSpeech("no", "accidentHistory", 2026)).toEqual({ accidentHistory: "No accident history" })
    expect(extractFromSpeech("clean", "accidentHistory", 2026)).toEqual({ accidentHistory: "No accident history" })
    expect(extractFromSpeech("hatch", "bodyType", 2026)).toEqual({ bodyType: "Hatchback" })
    expect(extractFromSpeech("a m t", "transmission", 2026)).toEqual({ transmission: "AMT" })
    expect(extractFromSpeech("regular", "serviceHistory", 2026)).toEqual({ serviceHistory: "Full service history" })
  })
})

describe("marketplace blanks", () => {
  it("covers every section, in order", () => {
    const order = VOICE_FIELDS.map((f) => VOICE_SECTIONS.indexOf(FIELD_DEF[f].section))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(new Set(order).size).toBe(VOICE_SECTIONS.length)
  })
  it("reads money, months, percent and yes/no", () => {
    expect(extractFromSpeech("EMI 12000 loan amount 5 lakh down payment 1 lakh 36 months 8.5 percent", "emiStart", 2026)).toMatchObject({
      emiStart: 12000, loanAmount: 500000, downPayment: 100000, loanDurationMonths: 36, interestRate: 8.5,
    })
    expect(extractFromSpeech("warranty yes flood affected no", "warrantyAvailable", 2026)).toMatchObject({ warrantyAvailable: true, floodAffected: false })
    expect(extractFromSpeech("flood affected", "floodAffected", 2026)).toEqual({ floodAffected: true })
    expect(extractFromSpeech("not flood affected", "floodAffected", 2026)).toEqual({ floodAffected: false })
    expect(extractFromSpeech("refundable", "tokenRefundable", 2026)).toEqual({ tokenRefundable: true })
    expect(val("loanDurationMonths", "3 years")).toBe(36)
  })
  it("reads options, condition, specs and the RTO", () => {
    expect(val("tyreCondition", "like new")).toBe("Excellent")
    expect(val("tyreCondition", "good")).toBe("Good")
    expect(val("batteryCondition", "weak")).toBe("Needs replacement")
    expect(val("availability", "coming soon")).toBe("Upcoming")
    expect(val("rto", "T N 22")).toBe("TN22")
    expect(extractFromSpeech("engine 1197 cc boot space 339 litres seating 5 mileage 22 kmpl", "engineCc", 2026)).toMatchObject({
      engineCc: "1197 cc", bootSpace: "339 litres", seatingCapacity: "5", mileage: "22 kmpl",
    })
  })
  it("collects features into their own group and adds to what is already there", () => {
    expect(extractFromSpeech("airbags ABS and a rear camera", "safety", 2026)).toEqual({ safety: ["Airbags", "ABS", "Rear camera"] })
    expect(extractFromSpeech("sunroof and alloy wheels", "make", 2026)).toEqual({ exterior: ["Sunroof", "Alloy wheels"] })
    expect(extractFromSpeech("cruise control", "comfort", 2026, { comfort: ["Automatic AC"] })).toEqual({ comfort: ["Automatic AC", "Cruise control"] })
    expect(extractFromSpeech("reasons to buy single owner and well maintained", "reasonsToBuy", 2026)).toEqual({ reasonsToBuy: ["Single owner", "Well maintained"] })
    expect(extractFromSpeech("warranty plan and roadside assistance", "protectionPlans", 2026)).toEqual({ protectionPlans: ["Warranty plan", "Roadside assistance 24x7"] })
  })
  it("keeps notes and panel issues as said", () => {
    expect(val("dentNotes", "small scratch on the front door")).toBe("Small scratch on the front door")
    expect(val("panelIssues", "front door: scratch")).toEqual(["Front door: scratch"])
  })
})

describe("server side", () => {
  it("keeps only known blanks whose value has the right shape", () => {
    const v = cleanVoiceValues({
      make: "Maruti", year: 2019, km: -5, fuel: "Steam", warrantyAvailable: "yes", safety: ["ABS", "Jetpack"], nonsense: 1, price: 650000, tokenRefundable: false,
    })
    expect(v).toEqual({ make: "Maruti", year: 2019, safety: ["ABS"], price: 650000, tokenRefundable: false })
    expect(cleanVoiceValues(null)).toEqual({})
  })
  it("maps every section into the listing", () => {
    const l = voiceToListing(
      cleanVoiceValues({
        plate: "TN11AB1234", make: "Maruti", model: "Baleno", year: 2019, owners: 1, km: 45000, fuel: "Petrol", transmission: "Manual", price: 650000,
        insurance: "Comprehensive", rto: "TN11", location: "Adyar", emiStart: 12000, interestRate: 8.5, tokenRefundable: false, availability: "Available",
        inspectionScore: 200, reasonsToBuy: ["Single owner"], warrantyAvailable: true, tyreCondition: "Good", panelIssues: ["Front door: scratch", "Bumper"],
        engineCc: "1197 cc", safety: ["ABS"], protectionPlans: ["Warranty plan"],
      }),
    )
    expect(l).toMatchObject({ make: "Maruti", ownerCount: 1, kmDriven: 45000, askingPrice: 650000, plate: "TN11AB1234", fuel: "Petrol" })
    const d = l.marketplaceDetails
    expect(d.overview).toMatchObject({ insuranceType: "Comprehensive", rto: "TN11", location: "Adyar" })
    expect(d.pricing).toMatchObject({ emiStart: 12000, interestRate: 8.5, tokenRefundable: false, availabilityStatus: "Available" })
    expect(d.trust).toMatchObject({ inspectionScore: 200, reasonsToBuy: ["Single owner"], warrantyAvailable: true })
    expect(d.condition.tyreCondition).toBe("Good")
    expect(d.condition.panelIssues).toEqual([{ panel: "Front door", issue: "scratch" }, { panel: "Bumper", issue: "Noted" }])
    expect(d.specs).toEqual({ engineCc: "1197 cc" })
    expect(d.features.safety).toEqual(["ABS"])
    expect(d.protectionPlans).toEqual(["Warranty plan"])
  })
})

describe("Tamil", () => {
  const ta = (said: string, active: Parameters<typeof extractFromSpeech>[1]) => extractFromSpeech(tamilToEnglish(said), active, 2026)
  it("reads spoken Tamil into the same blanks", () => {
    expect(ta("பெட்ரோல்", "fuel")).toEqual({ fuel: "Petrol" })
    expect(ta("மேனுவல்", "transmission")).toEqual({ transmission: "Manual" })
    expect(ta("முதல் உரிமையாளர்", "owners")).toEqual({ owners: 1 })
    expect(ta("45 ஆயிரம் கிலோமீட்டர்", "km")).toEqual({ km: 45000 })
    expect(ta("ஆறு புள்ளி ஐந்து லட்சம்", "price")).toEqual({ price: 650000 })
    expect(ta("6.5 லட்சம்", "price")).toEqual({ price: 650000 })
    expect(ta("நிறம் வெள்ளை", "colour")).toEqual({ colour: "White" })
    expect(ta("வாரண்டி ஆம்", "warrantyAvailable")).toEqual({ warrantyAvailable: true })
    expect(ta("விபத்து இல்லை", "accidentHistory")).toEqual({ accidentHistory: "No accident history" })
    expect(ta("௨௦௧௯", "year")).toEqual({ year: 2019 })
  })
  it("understands the commands", () => {
    expect(isSkip(tamilToEnglish("தவிர்"))).toBe(true)
    expect(tamilToEnglish("அடுத்த பிரிவு")).toBe("next section")
  })
  it("shows values in Tamil without changing what is stored", () => {
    expect(formatVoiceValue("fuel", "Petrol", "ta")).toBe("பெட்ரோல்")
    expect(formatVoiceValue("safety", ["Airbags", "ABS"], "ta")).toBe("ஏர்பேக்குகள், ABS")
    expect(formatVoiceValue("owners", 1, "ta")).toBe("முதல் உரிமையாளர்")
    expect(formatVoiceValue("fuel", "Petrol")).toBe("Petrol")
  })
  it("has a Tamil sentence for every blank in every section", () => {
    const en = copy.admin.addCar.voice
    for (const section of VOICE_SECTIONS) {
      const blanks = (parts: readonly string[]) => parts.filter((p) => p in FIELD_DEF)
      expect(blanks(voiceTa.sections[section].parts)).toEqual(blanks(en.sections[section].parts))
    }
    for (const f of VOICE_FIELDS) {
      expect(voiceTa.fields[f]).toBeTruthy()
      expect(voiceTa.examples[f]).toBeTruthy()
    }
    expect(Object.keys(OPTION_TA).length).toBeGreaterThan(60)
  })
})

describe("Tanglish", () => {
  const tg = (said: string, active: Parameters<typeof extractFromSpeech>[1]) => extractFromSpeech(tanglishToEnglish(said), active, 2026)
  it("reads Tamil in English letters, mixed with English words", () => {
    expect(tg("mudhal owner", "owners")).toEqual({ owners: 1 })
    expect(tg("45 aayiram km", "km")).toEqual({ km: 45000 })
    expect(tg("naalu latcham", "price")).toEqual({ price: 400000 })
    expect(tg("aaru latcham", "price")).toEqual({ price: 600000 })
    expect(tg("niram vellai", "colour")).toEqual({ colour: "White" })
    expect(tg("warranty aama", "warrantyAvailable")).toEqual({ warrantyAvailable: true })
    expect(tg("flood illa", "floodAffected")).toEqual({ floodAffected: false })
    expect(tg("accident illa", "accidentHistory")).toEqual({ accidentHistory: "No accident history" })
    expect(tg("petrol manual", "fuel")).toMatchObject({ fuel: "Petrol", transmission: "Manual" })
    expect(tg("EMI 12000 loan kaalam moonu varusham", "emiStart")).toMatchObject({ emiStart: 12000 })
  })
  it("understands the commands and leaves plain English alone", () => {
    expect(tanglishToEnglish("adutha section")).toBe("next section")
    expect(tanglishToEnglish("Baleno alpha")).toBe("Baleno alpha")
  })
  it("has Tanglish text for every blank in every section", () => {
    const en = copy.admin.addCar.voice
    for (const section of VOICE_SECTIONS) {
      const blanks = (parts: readonly string[]) => parts.filter((p) => p in FIELD_DEF)
      expect(blanks(voiceTg.sections[section].parts)).toEqual(blanks(en.sections[section].parts))
    }
    expect(formatVoiceValue("warrantyAvailable", true, "tg")).toBe("Aama")
    expect(formatVoiceValue("owners", 1, "tg")).toBe("Mudhal owner")
    expect(formatVoiceValue("fuel", "Petrol", "tg")).toBe("Petrol")
  })
})

describe("voice draft", () => {
  it("reads a saved session back, dropping anything that is not a real blank", () => {
    const d = readVoiceDraft({ values: { make: "Maruti", model: "Baleno", year: 2019, fuel: "Steam", junk: 1 }, lang: "ta", done: false })
    expect(d).toEqual({ values: { make: "Maruti", model: "Baleno", year: 2019 }, lang: "ta", done: false })
    expect(voiceDraftTitle(d)).toBe("2019 Maruti Baleno")
  })
  it("has safe defaults and no title without anything said", () => {
    expect(readVoiceDraft(null)).toBeNull()
    expect(readVoiceDraft({ values: 5, lang: "xx" })).toEqual({ values: {}, lang: "en", done: false })
    expect(voiceDraftTitle(readVoiceDraft({ values: {}, lang: "en", done: false }))).toBeNull()
    expect(voiceDraftTitle(null)).toBeNull()
  })
})

describe("voice entry by plan", () => {
  it("is for Growth and above, not Starter", () => {
    expect(PLANS.starter.voiceEntry).toBe(false)
    expect(PLANS.growth.voiceEntry).toBe(true)
    expect(PLANS.pro.voiceEntry).toBe(true)
    expect(PLANS.scale.voiceEntry).toBe(true)
  })
})
