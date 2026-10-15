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
