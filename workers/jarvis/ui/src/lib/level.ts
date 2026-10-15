// Keeps every sentence at a similar loudness. A sentence that comes out of the voice model a little quiet is lifted towards a
// common level, loud ones are left alone, and a soft limiter stops anything lifted from clipping.

export const TARGET_RMS = 0.12 // about -18 dBFS: clear and full without being harsh
export const MIN_GAIN = 0.85
export const MAX_GAIN = 2.2

export interface LevelState { gain: number; measured: boolean }
export const newLevel = (): LevelState => ({ gain: 1, measured: false })

const rmsOf = (s: Float32Array) => {
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += s[i] * s[i]
  return Math.sqrt(sum / (s.length || 1))
}

/** Gentle ceiling: samples above 0.9 are squeezed towards 1 instead of being cut off. */
export const soften = (v: number) => (Math.abs(v) <= 0.9 ? v : Math.sign(v) * (0.9 + 0.1 * Math.tanh((Math.abs(v) - 0.9) / 0.1)))

/** Adjusts `samples` in place towards the target loudness. The gain moves smoothly from one chunk to the next. */
export function normalise(samples: Float32Array, state: LevelState): void {
  const rms = rmsOf(samples)
  if (rms > 0.01) {
    const wanted = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_RMS / rms))
    state.gain = state.measured ? state.gain * 0.7 + wanted * 0.3 : wanted
    state.measured = true
  }
  for (let i = 0; i < samples.length; i++) samples[i] = soften(samples[i] * state.gain)
}
