// Pairs photo files with products by name. Careful on purpose: a wrong picture on a live store is worse than none, so a file that
// could belong to two products, or names a different size, is left for the owner to choose.

export type PhotoTarget = { id: string; name: string }

/** "Amul_Butter-100 g (1).JPG" -> ["amul", "butter", "100g"] */
export function photoWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/(\d)\s*(kgs?|gms?|grams?|g|ml|ltrs?|litres?|liters?|l|pcs?)(?![a-z])/g, (_, n: string, unit: string) => `${n}${unit.startsWith("k") ? "kg" : unit.startsWith("m") ? "ml" : unit.startsWith("l") ? "l" : unit.startsWith("p") ? "pc" : "g"}`)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** A word that states a quantity: "100g", "1kg", "30", "3x125g". */
const isSize = (word: string) => /\d/.test(word)

function matches(file: string[], product: string[]): boolean {
  if (file.join("") === product.join("")) return true
  const fileSizes = file.filter(isSize)
  const productSizes = product.filter(isSize)
  // A size in the file name must be the product's size.
  if (fileSizes.some((s) => !productSizes.includes(s))) return false
  const words = product.filter((w) => !isSize(w))
  // Without the size, every other word of the product's name has to be there.
  return words.length > 0 && words.every((w) => file.includes(w))
}

/** For each file name, the one product it clearly shows, or null. No product is given to two files. */
export function matchPhotos(fileNames: string[], products: PhotoTarget[]): (string | null)[] {
  const named = products.map((p) => ({ id: p.id, words: photoWords(p.name) }))
  const found = fileNames.map((fileName) => {
    const file = photoWords(fileName)
    if (file.length === 0) return null
    const exact = named.filter((p) => p.words.join("") === file.join(""))
    const hits = exact.length ? exact : named.filter((p) => matches(file, p.words))
    if (hits.length === 0) return null
    // "sunflower oil refined" fits both "Oil" and "Sunflower Oil": the longer name wins, a tie is left alone.
    const longest = Math.max(...hits.map((h) => h.words.length))
    const best = hits.filter((h) => h.words.length === longest)
    return best.length === 1 ? best[0].id : null
  })
  return found.map((id, i) => (id !== null && found.indexOf(id) === i ? id : null))
}
