/** Tamil display names for the app's fixed option lists. The stored value is always the English one. */
export const OPTION_TA: Record<string, string> = {
  Petrol: "பெட்ரோல்", Diesel: "டீசல்", CNG: "சிஎன்ஜி", LPG: "எல்பிஜி", Electric: "மின்சாரம்", Hybrid: "ஹைபிரிட்",
  Manual: "மேனுவல்", Automatic: "ஆட்டோமேட்டிக்", "Torque Converter": "டார்க் கன்வெர்ட்டர்",
  Comprehensive: "முழுமையான", "Third Party": "மூன்றாம் தரப்பு", "Zero Dep": "ஜீரோ டெப்", Expired: "காலாவதியானது", "Not Available": "இல்லை",
  Hatchback: "ஹேட்ச்பேக்", Sedan: "செடான்", SUV: "எஸ்யூவி", MUV: "எம்யூவி", Coupe: "கூபே", Convertible: "கன்வெர்ட்டிபிள்", Pickup: "பிக்அப்", Van: "வேன்",
  Available: "கிடைக்கும்", Upcoming: "விரைவில்", Booked: "முன்பதிவு", Sold: "விற்றுவிட்டது",
  Excellent: "சிறந்தது", Good: "நன்று", Average: "சராசரி", "Needs replacement": "மாற்ற வேண்டும்",
  "Full service history": "முழு சர்வீஸ் வரலாறு", "Partial service history": "பகுதி சர்வீஸ் வரலாறு", "Dealer maintained": "டீலர் பராமரிப்பு", "Not available": "கிடைக்கவில்லை",
  "No accident history": "விபத்து இல்லை", "Minor repairs": "சிறு பழுதுகள்", "Major repair disclosed": "பெரிய பழுது தெரிவிக்கப்பட்டது", "Not known": "தெரியாது",
  "Assured with warranty": "வாரண்டியுடன் உறுதி", "Single owner": "ஒரே உரிமையாளர்", "Low kilometres": "குறைந்த கிலோமீட்டர்", "Non-accidental": "விபத்து இல்லாதது",
  "Well maintained": "நன்கு பராமரிக்கப்பட்டது", "Recently serviced": "சமீபத்தில் சர்வீஸ்", "New tyres": "புதிய டயர்கள்", "Top variant": "டாப் வேரியண்ட்",
  Airbags: "ஏர்பேக்குகள்", "Rear camera": "பின் கேமரா", "Parking sensors": "பார்க்கிங் சென்சார்கள்", "Hill hold": "ஹில் ஹோல்ட்",
  "Cruise control": "க்ரூஸ் கண்ட்ரோல்", "Keyless start": "கீலெஸ் ஸ்டார்ட்", "Automatic AC": "ஆட்டோ AC", "Rear AC vents": "பின் AC வென்ட்", "Power windows": "பவர் விண்டோ",
  Sunroof: "சன்ரூஃப்", "Alloy wheels": "அலாய் வீல்", "Rain sensing wipers": "மழை உணர் வைப்பர்", "LED headlights": "LED ஹெட்லைட்", "Fog lamps": "பனி விளக்குகள்",
  "Leather seats": "லெதர் இருக்கைகள்", "Height adjustable seat": "உயரம் மாற்றும் இருக்கை", Armrest: "கை ஓய்வு", "Ambient lighting": "ஆம்பியன்ட் லைட்",
  Touchscreen: "டச் ஸ்கிரீன்", "Android Auto": "ஆண்ட்ராய்டு ஆட்டோ", "Apple CarPlay": "ஆப்பிள் கார்ப்ளே", Bluetooth: "புளூடூத்", "Steering controls": "ஸ்டீயரிங் கண்ட்ரோல்",
  "Comprehensive insurance": "முழுமையான காப்பீடு", "Warranty plan": "வாரண்டி திட்டம்", "Periodic service": "கால சர்வீஸ்",
  "Roadside assistance 24x7": "24x7 சாலையோர உதவி", "90-day buyback assurance": "90 நாள் திரும்ப வாங்கும் உறுதி", "Maintenance package": "பராமரிப்பு தொகுப்பு",
  Yes: "ஆம்", No: "இல்லை",
}

export const tamilOption = (s: string) => OPTION_TA[s] ?? s

// Spoken Tamil (as the browser writes it) -> the English words the rest of the parser already understands.
// Longer phrases come first so "முதல் உரிமையாளர்" is read as "first owner" before "உரிமையாளர்" alone.
const WORDS: [string, string][] = [
  // commands
  ["அடுத்த பிரிவு", "next section"], ["தவிர்க்கவும்", "skip"], ["தவிர்", "skip"], ["அடுத்தது", "next"], ["தெரியாது", "don't know"],
  // owners
  ["முதல் உரிமையாளர்", "first owner"], ["இரண்டாவது உரிமையாளர்", "second owner"], ["மூன்றாவது உரிமையாளர்", "third owner"], ["நான்காவது உரிமையாளர்", "fourth owner"],
  ["ஒரே உரிமையாளர்", "single owner"], ["உரிமையாளர்கள்", "owners"], ["உரிமையாளர்", "owner"],
  // labels
  ["எதிர்பார்க்கும் விலை", "asking price"], ["பதிவு எண்", "registration number"], ["பதிவு ஆண்டு", "registration year"], ["தயாரிப்பு ஆண்டு", "make year"],
  ["ஓடிய தூரம்", "km driven"], ["பிராண்ட்", "brand"], ["மாடல்", "model"], ["வேரியண்ட்", "variant"], ["ஆண்டு", "year"], ["வருடம்", "year"],
  ["எரிபொருள்", "fuel"], ["கியர் வகை", "transmission"], ["டிரான்ஸ்மிஷன்", "transmission"], ["நிறம்", "colour"], ["விலை", "price"],
  ["காப்பீடு", "insurance"], ["வாகன வகை", "body type"], ["இடம்", "location"],
  ["முன்பதிவு தொகை", "booking amount"], ["கடன் தொகை", "loan amount"], ["கடன் காலம்", "loan duration"], ["முன்பணம்", "down payment"], ["வட்டி விகிதம்", "interest rate"], ["வட்டி", "interest"],
  ["ஆய்வு மதிப்பெண்", "inspection score"], ["ஆய்வு சுருக்கம்", "inspection summary"], ["சர்வீஸ் வரலாறு", "service history"], ["விபத்து வரலாறு", "accident history"],
  ["வாங்க காரணங்கள்", "reasons to buy"], ["வாரண்டி", "warranty"], ["வெள்ளம்", "flood"], ["திரும்பப் பெறலாம்", "refundable"],
  ["டயர் நிலை", "tyre condition"], ["பேட்டரி நிலை", "battery condition"], ["டயர்", "tyre"], ["பேட்டரி", "battery"], ["பேனல்", "panel"],
  ["இன்ஜின் திறன்", "engine capacity"], ["இன்ஜின்", "engine"], ["பூட் இடம்", "boot space"], ["இருக்கை எண்ணிக்கை", "seating capacity"], ["மைலேஜ்", "mileage"], ["கிரவுண்ட் கிளியரன்ஸ்", "ground clearance"],
  ["பாதுகாப்பு வசதிகள்", "safety features"], ["சௌகரிய வசதிகள்", "comfort features"], ["வெளிப்புற வசதிகள்", "exterior features"], ["உட்புற வசதிகள்", "interior features"], ["இன்ஃபோடெயின்மென்ட்", "infotainment"],
  ["பாதுகாப்பு திட்டங்கள்", "protection plans"],
  // choices
  ["பெட்ரோல்", "petrol"], ["டீசல்", "diesel"], ["சிஎன்ஜி", "cng"], ["எலக்ட்ரிக்", "electric"], ["மின்சாரம்", "electric"], ["ஹைபிரிட்", "hybrid"],
  ["மேனுவல்", "manual"], ["ஆட்டோமேட்டிக்", "automatic"], ["ஆட்டோ", "auto"],
  ["முழுமையான", "comprehensive"], ["மூன்றாம் தரப்பு", "third party"], ["காலாவதி", "expired"],
  ["ஹேட்ச்பேக்", "hatchback"], ["செடான்", "sedan"], ["எஸ்யூவி", "suv"], ["எம்யூவி", "muv"],
  ["விபத்து இல்லை", "no accident"], ["விபத்து", "accident"], ["சிறந்தது", "excellent"], ["நன்றாக", "good"], ["நன்று", "good"], ["சராசரி", "average"],
  ["ஏர்பேக்", "airbags"], ["பின் கேமரா", "rear camera"], ["சன்ரூஃப்", "sunroof"], ["அலாய்", "alloy wheels"], ["புளூடூத்", "bluetooth"], ["டச் ஸ்கிரீன்", "touchscreen"], ["க்ரூஸ்", "cruise control"],
  // colours
  ["வெள்ளை", "white"], ["கருப்பு", "black"], ["கறுப்பு", "black"], ["சிவப்பு", "red"], ["நீலம்", "blue"], ["சாம்பல்", "grey"], ["வெள்ளி", "silver"], ["பச்சை", "green"], ["மஞ்சள்", "yellow"], ["ஆரஞ்சு", "orange"], ["பழுப்பு", "brown"],
  // yes / no
  ["ஆமாம்", "yes"], ["ஆம்", "yes"], ["உண்டு", "yes"], ["இல்லை", "no"], ["இல்ல", "no"],
  // numbers and units
  ["கிலோமீட்டர்", "km"], ["கி.மீ", "km"], ["லட்சங்கள்", "lakh"], ["லட்சம்", "lakh"], ["லக்ஷம்", "lakh"], ["ஆயிரம்", "thousand"], ["நூறு", "hundred"],
  ["புள்ளி", "point"], ["சதவீதம்", "percent"], ["மாதங்கள்", "months"], ["மாதம்", "months"],
  ["தொண்ணூறு", "ninety"], ["எண்பது", "eighty"], ["எழுபது", "seventy"], ["அறுபது", "sixty"], ["ஐம்பது", "fifty"], ["நாற்பது", "forty"], ["முப்பது", "thirty"], ["இருபது", "twenty"],
  ["ஒன்பது", "nine"], ["பத்து", "ten"], ["ஒன்று", "one"], ["இரண்டு", "two"], ["மூன்று", "three"], ["நான்கு", "four"], ["ஐந்து", "five"], ["ஆறு", "six"], ["ஏழு", "seven"], ["எட்டு", "eight"],
]

const TAMIL_DIGITS = "௦௧௨௩௪௫௬௭௮௯"

/** Spoken or typed Tamil -> English words and digits, so the same parser can read both. Words it does not know are left as they are. */
export function tamilToEnglish(text: string): string {
  let out = [...text].map((c) => (TAMIL_DIGITS.includes(c) ? String(TAMIL_DIGITS.indexOf(c)) : c)).join("")
  for (const [ta, en] of WORDS) out = out.split(ta).join(` ${en} `)
  return out.replace(/\s+/g, " ").trim()
}

// Tanglish: Tamil written (and spoken) in English letters, mixed with English words. Whole words only, longest phrase first.
const TANGLISH: [string, string][] = [
  // commands
  ["adutha section", "next section"], ["adutha idam", "next"], ["adutha", "next"], ["theriyadhu", "don't know"], ["theriyala", "don't know"],
  // owners
  ["mudhal owner", "first owner"], ["muthal owner", "first owner"], ["rendavadhu owner", "second owner"], ["moonavadhu owner", "third owner"], ["oru owner", "single owner"],
  // labels
  ["registration number", "registration number"], ["evlo km odirukku", "km driven"], ["km odirukku", "km driven"], ["gear type", "transmission"], ["expected vilai", "asking price"],
  ["vilai", "price"], ["niram", "colour"], ["varusham", "year"], ["aandu", "year"], ["irukku", "yes"],
  ["maasa emi", "emi"], ["loan kaalam", "loan duration"], ["vaanga reasons", "reasons to buy"], ["vellam", "flood"],
  // colours
  ["vellai", "white"], ["karuppu", "black"], ["sivappu", "red"], ["neelam", "blue"], ["saambal", "grey"], ["pachai", "green"], ["manjal", "yellow"],
  // yes / no
  ["accident illa", "no accident"], ["aamam", "yes"], ["aamaam", "yes"], ["amam", "yes"], ["aama", "yes"], ["illaye", "no"], ["illai", "no"], ["illa", "no"],
  // numbers and units
  ["thonnooru", "ninety"], ["enbadhu", "eighty"], ["ezhubadhu", "seventy"], ["arubadhu", "sixty"], ["aimbadhu", "fifty"], ["ambadhu", "fifty"], ["naarpadhu", "forty"],
  ["muppadhu", "thirty"], ["irupadhu", "twenty"], ["onbadhu", "nine"], ["onbathu", "nine"], ["pathu", "ten"], ["patthu", "ten"],
  ["onnu", "one"], ["ondru", "one"], ["rendu", "two"], ["irandu", "two"], ["moonu", "three"], ["moondru", "three"], ["naalu", "four"], ["naangu", "four"],
  ["anju", "five"], ["ainthu", "five"], ["aaru", "six"], ["ezhu", "seven"], ["yezhu", "seven"], ["ettu", "eight"],
  ["nooru", "hundred"], ["aayiram", "thousand"], ["ayiram", "thousand"], ["latcham", "lakh"], ["laksham", "lakh"], ["sadhaveedham", "percent"],
  ["maasam", "months"], ["maadham", "months"], ["maasangal", "months"],
]
const TANGLISH_RE = TANGLISH.map(([from, to]) => [new RegExp(`\\b${from.replace(/ /g, "\\s+")}\\b`, "gi"), to] as const)

/** Tanglish -> plain English words and digits. English words pass through untouched. */
export function tanglishToEnglish(text: string): string {
  let out = text
  for (const [re, to] of TANGLISH_RE) out = out.replace(re, ` ${to} `)
  return out.replace(/\s+/g, " ").trim()
}
