/** Builds a wa.me deep link. Dealer phones are stored as +91XXXXXXXXXX; wa.me wants digits only. */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`
}
