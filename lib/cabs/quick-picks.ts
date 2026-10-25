/** Airports and railway stations people ask for most. Tapping one looks the place up by name, so the id comes from the map service. */
export type QuickPick = { key: string; kind: "airport" | "rail"; en: string; ta: string; query: string; city: string; lat: number; lng: number }

export const QUICK_PICKS: readonly QuickPick[] = [
  { key: "maa", kind: "airport", en: "Chennai Airport", ta: "சென்னை விமான நிலையம்", query: "Chennai International Airport", city: "chennai", lat: 12.9941, lng: 80.1709 },
  { key: "cjb", kind: "airport", en: "Coimbatore Airport", ta: "கோயம்புத்தூர் விமான நிலையம்", query: "Coimbatore International Airport", city: "coimbatore", lat: 11.03, lng: 77.0434 },
  { key: "ixm", kind: "airport", en: "Madurai Airport", ta: "மதுரை விமான நிலையம்", query: "Madurai Airport", city: "madurai", lat: 9.8345, lng: 78.0934 },
  { key: "trz", kind: "airport", en: "Tiruchirappalli Airport", ta: "திருச்சிராப்பள்ளி விமான நிலையம்", query: "Tiruchirappalli International Airport", city: "tiruchirappalli", lat: 10.7654, lng: 78.7097 },
  { key: "tcr", kind: "airport", en: "Thoothukudi Airport", ta: "தூத்துக்குடி விமான நிலையம்", query: "Thoothukudi Airport", city: "thoothukudi", lat: 8.7249, lng: 78.0258 },
  { key: "blr", kind: "airport", en: "Bengaluru Airport", ta: "பெங்களூரு விமான நிலையம்", query: "Kempegowda International Airport Bengaluru", city: "bengaluru", lat: 13.1986, lng: 77.7066 },
  { key: "trv", kind: "airport", en: "Thiruvananthapuram Airport", ta: "திருவனந்தபுரம் விமான நிலையம்", query: "Trivandrum International Airport", city: "thiruvananthapuram", lat: 8.4821, lng: 76.92 },
  { key: "mas", kind: "rail", en: "Chennai Central", ta: "சென்னை சென்ட்ரல்", query: "Chennai Central railway station", city: "chennai", lat: 13.0827, lng: 80.2757 },
  { key: "mmc", kind: "rail", en: "Chennai Egmore", ta: "சென்னை எழும்பூர்", query: "Chennai Egmore railway station", city: "chennai", lat: 13.0732, lng: 80.2609 },
  { key: "cbe", kind: "rail", en: "Coimbatore Junction", ta: "கோயம்புத்தூர் சந்திப்பு", query: "Coimbatore Junction railway station", city: "coimbatore", lat: 10.9976, lng: 76.966 },
  { key: "mdu", kind: "rail", en: "Madurai Junction", ta: "மதுரை சந்திப்பு", query: "Madurai Junction railway station", city: "madurai", lat: 9.9195, lng: 78.112 },
  { key: "tpj", kind: "rail", en: "Tiruchirappalli Junction", ta: "திருச்சிராப்பள்ளி சந்திப்பு", query: "Tiruchirappalli Junction railway station", city: "tiruchirappalli", lat: 10.805, lng: 78.6856 },
  { key: "nn", kind: "rail", en: "Tirunelveli Junction", ta: "திருநெல்வேலி சந்திப்பு", query: "Tirunelveli Junction railway station", city: "tirunelveli", lat: 8.7276, lng: 77.7316 },
  { key: "sa", kind: "rail", en: "Salem Junction", ta: "சேலம் சந்திப்பு", query: "Salem Junction railway station", city: "salem", lat: 11.668, lng: 78.138 },
  { key: "tj", kind: "rail", en: "Thanjavur Junction", ta: "தஞ்சாவூர் சந்திப்பு", query: "Thanjavur Junction railway station", city: "thanjavur", lat: 10.7936, lng: 79.148 },
]

export const quickPickByKey = (key: string) => QUICK_PICKS.find((q) => q.key === key) ?? null

/** The picks for an operator: those in the cities it serves, or all when it lists none (or none match). */
export function picksFor(serviceCities: readonly string[]): readonly QuickPick[] {
  const cities = serviceCities.map((c) => c.trim().toLowerCase()).filter(Boolean)
  if (cities.length === 0) return QUICK_PICKS
  const mine = QUICK_PICKS.filter((q) => cities.some((c) => c.includes(q.city) || q.city.includes(c)))
  return mine.length > 0 ? mine : QUICK_PICKS
}

/** Where the home map opens, by city. Only the cities the quick picks know; anything else opens on Tamil Nadu. */
const CITY_CENTRES: Record<string, [number, number]> = {
  chennai: [13.0827, 80.2707],
  coimbatore: [11.0168, 76.9558],
  madurai: [9.9252, 78.1198],
  tiruchirappalli: [10.7905, 78.7047],
  thoothukudi: [8.7642, 78.1348],
  bengaluru: [12.9716, 77.5946],
  thiruvananthapuram: [8.5241, 76.9366],
  tirunelveli: [8.7139, 77.7567],
  salem: [11.6643, 78.146],
  thanjavur: [10.787, 79.1378],
}
const TAMIL_NADU: { centre: [number, number]; zoom: number } = { centre: [10.9, 78.4], zoom: 7 }

export function mapCentreFor(serviceCities: readonly string[], city: string): { centre: [number, number]; zoom: number } {
  for (const name of [...serviceCities, city]) {
    const n = name.trim().toLowerCase()
    const hit = Object.keys(CITY_CENTRES).find((c) => n.includes(c) || c.includes(n))
    if (n && hit) return { centre: CITY_CENTRES[hit]!, zoom: 11 }
  }
  return TAMIL_NADU
}
