/** Airports and railway stations people ask for most. Tapping one looks the place up by name, so the id comes from the map service. */
export type QuickPick = { key: string; kind: "airport" | "rail"; en: string; ta: string; query: string; city: string }

export const QUICK_PICKS: readonly QuickPick[] = [
  { key: "maa", kind: "airport", en: "Chennai Airport", ta: "சென்னை விமான நிலையம்", query: "Chennai International Airport", city: "chennai" },
  { key: "cjb", kind: "airport", en: "Coimbatore Airport", ta: "கோயம்புத்தூர் விமான நிலையம்", query: "Coimbatore International Airport", city: "coimbatore" },
  { key: "ixm", kind: "airport", en: "Madurai Airport", ta: "மதுரை விமான நிலையம்", query: "Madurai Airport", city: "madurai" },
  { key: "trz", kind: "airport", en: "Tiruchirappalli Airport", ta: "திருச்சிராப்பள்ளி விமான நிலையம்", query: "Tiruchirappalli International Airport", city: "tiruchirappalli" },
  { key: "tcr", kind: "airport", en: "Thoothukudi Airport", ta: "தூத்துக்குடி விமான நிலையம்", query: "Thoothukudi Airport", city: "thoothukudi" },
  { key: "blr", kind: "airport", en: "Bengaluru Airport", ta: "பெங்களூரு விமான நிலையம்", query: "Kempegowda International Airport Bengaluru", city: "bengaluru" },
  { key: "trv", kind: "airport", en: "Thiruvananthapuram Airport", ta: "திருவனந்தபுரம் விமான நிலையம்", query: "Trivandrum International Airport", city: "thiruvananthapuram" },
  { key: "mas", kind: "rail", en: "Chennai Central", ta: "சென்னை சென்ட்ரல்", query: "Chennai Central railway station", city: "chennai" },
  { key: "mmc", kind: "rail", en: "Chennai Egmore", ta: "சென்னை எழும்பூர்", query: "Chennai Egmore railway station", city: "chennai" },
  { key: "cbe", kind: "rail", en: "Coimbatore Junction", ta: "கோயம்புத்தூர் சந்திப்பு", query: "Coimbatore Junction railway station", city: "coimbatore" },
  { key: "mdu", kind: "rail", en: "Madurai Junction", ta: "மதுரை சந்திப்பு", query: "Madurai Junction railway station", city: "madurai" },
  { key: "tpj", kind: "rail", en: "Tiruchirappalli Junction", ta: "திருச்சிராப்பள்ளி சந்திப்பு", query: "Tiruchirappalli Junction railway station", city: "tiruchirappalli" },
  { key: "nn", kind: "rail", en: "Tirunelveli Junction", ta: "திருநெல்வேலி சந்திப்பு", query: "Tirunelveli Junction railway station", city: "tirunelveli" },
  { key: "sa", kind: "rail", en: "Salem Junction", ta: "சேலம் சந்திப்பு", query: "Salem Junction railway station", city: "salem" },
  { key: "tj", kind: "rail", en: "Thanjavur Junction", ta: "தஞ்சாவூர் சந்திப்பு", query: "Thanjavur Junction railway station", city: "thanjavur" },
]

export const quickPickByKey = (key: string) => QUICK_PICKS.find((q) => q.key === key) ?? null

/** The picks for an operator: those in the cities it serves, or all when it lists none (or none match). */
export function picksFor(serviceCities: readonly string[]): readonly QuickPick[] {
  const cities = serviceCities.map((c) => c.trim().toLowerCase()).filter(Boolean)
  if (cities.length === 0) return QUICK_PICKS
  const mine = QUICK_PICKS.filter((q) => cities.some((c) => c.includes(q.city) || q.city.includes(c)))
  return mine.length > 0 ? mine : QUICK_PICKS
}
