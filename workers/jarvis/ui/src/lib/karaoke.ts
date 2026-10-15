// Which word of a sentence is being spoken right now, from how far through its audio we are (0 to 1).
// Longer words take longer to say, so each word is weighted by its length, with a small extra for the pause after punctuation.

export interface Word { text: string; weight: number }

export function wordsOf(sentence: string): Word[] {
  return sentence
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, weight: text.replace(/[^\p{L}\p{N}]/gu, "").length + 1 + (/[,;:]$/.test(text) ? 1.5 : /[.!?]$/.test(text) ? 2.5 : 0) }))
}

/** Index of the word being spoken at `fraction` (clamped to 0..1). */
export function wordAt(words: Word[], fraction: number): number {
  if (!words.length) return 0
  const total = words.reduce((n, w) => n + w.weight, 0)
  const target = Math.min(1, Math.max(0, fraction)) * total
  let run = 0
  for (let i = 0; i < words.length; i++) {
    run += words[i].weight
    if (target < run) return i
  }
  return words.length - 1
}

/** True for a word that ends a sentence ("Sprint 1.", "overdue!", "ready?"), also when a quote or bracket closes after the mark. */
export const endsSentence = (word: string) => /[.!?]["')\]]*$/.test(word)

/**
 * Splits the words of one spoken piece into sentences, so each can start on its own line. Returns the index ranges
 * [start, end) so the word positions (and the word being spoken) stay the same as in the flat list.
 */
export function sentenceRanges(words: Word[]): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  words.forEach((w, i) => {
    if (endsSentence(w.text) && i < words.length - 1) { out.push([start, i + 1]); start = i + 1 }
  })
  if (start < words.length) out.push([start, words.length])
  return out
}
