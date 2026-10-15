// Decides whether a recorded burst of sound is the user talking to Jarvis, or only the room: another voice, a TV, a clap,
// a fan. Pure functions with no browser APIs, so they can be tested. mic.ts feeds them the numbers.

export interface UtteranceStats {
  /** Milliseconds that were clearly louder than the room. */
  voicedMs: number
  /** Loudness (RMS, 0 to 1) of each loud frame, in order. */
  levels: number[]
  /** Share of the sound energy that sits in the range of the human voice (300 to 3400 Hz), 0 to 1. */
  band: number
}

export const MIN_VOICED_MS = 450
export const MIN_LEVEL = 0.02
export const MIN_BAND = 0.5
export const MIN_VARIATION = 0.2
/** Anything this much quieter than your usual speaking level is treated as someone else, further away. */
export const QUIET_RATIO = 0.4

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1)

/** How much the loudness rises and falls (speech does, with its syllables; a steady hum or hiss does not). */
export function variation(levels: number[]): number {
  if (levels.length < 3) return 0
  const m = mean(levels)
  return m ? Math.sqrt(mean(levels.map((l) => (l - m) ** 2))) / m : 0
}

/** The loudness of an utterance: a high percentile of its loud frames, so one click does not decide it. */
export function level(levels: number[]): number {
  if (!levels.length) return 0
  const sorted = [...levels].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * 0.75)]
}

export function judge(stats: UtteranceStats, baseline: number | null, manual = false): { ok: boolean; reason?: string } {
  if (stats.voicedMs < (manual ? 250 : MIN_VOICED_MS)) return { ok: false, reason: "too short" }
  if (manual) return { ok: true }
  const l = level(stats.levels)
  if (l < MIN_LEVEL) return { ok: false, reason: "too quiet" }
  if (stats.band < MIN_BAND) return { ok: false, reason: "not a voice" }
  if (variation(stats.levels) < MIN_VARIATION) return { ok: false, reason: "steady noise" }
  if (baseline !== null && l < baseline * QUIET_RATIO) return { ok: false, reason: "far away" }
  return { ok: true }
}

/** Your usual speaking level, learned from the utterances that passed. */
export function nextBaseline(prev: number | null, stats: UtteranceStats): number {
  const l = level(stats.levels)
  return prev === null ? l : prev * 0.7 + l * 0.3
}

/** Share of spectrum energy between 300 and 3400 Hz out of 60 to 8000 Hz. `db` is an analyser's frequency data (decibels). */
export function bandRatio(db: ArrayLike<number>, sampleRate: number): number {
  const binHz = sampleRate / 2 / db.length
  let voice = 0, all = 0
  for (let i = 0; i < db.length; i++) {
    const hz = i * binHz
    if (hz < 60 || hz > 8000) continue
    const p = Math.pow(10, (db[i] || -140) / 10)
    all += p
    if (hz >= 300 && hz <= 3400) voice += p
  }
  return all ? voice / all : 0
}
