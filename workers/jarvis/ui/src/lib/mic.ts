// Records the microphone and cuts it into questions by itself (voice activity detection), so there is nothing to tap.
// Each question comes out as a 16 kHz mono WAV that Jarvis sends to Gemini. The browser's echo cancellation is switched on,
// which removes most of Jarvis's own voice from the recording.
import { audioContext } from "@/lib/jarvis"
import { bandRatio, judge, nextBaseline, type UtteranceStats } from "@/lib/vad"

const RATE = 16000
const PRE_ROLL_MS = 400 // kept from before the voice was noticed, so the first syllable is not cut off
const END_SILENCE_MS = 700 // a pause this long ends the question
const MIN_VOICED_MS = 300 // shorter than this is a click or a cough
const MAX_MS = 14000

export interface Listener {
  stop(): void
  /** Louder and longer speech is needed (used while Jarvis is talking, so a leftover echo does not count as you). */
  setStrict(on: boolean): void
  /** 0 to 1, how loud the room is right now (for a meter, if wanted). */
  level(): number
  /** Push-to-talk: while the gate is open everything is recorded as one question; closing it sends it. */
  setGate(open: boolean): void
}

export interface ListenerHandlers {
  onSpeechStart(): void
  onUtterance(wav: Blob): void
}

function wav(samples: Int16Array): Blob {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)) }
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ")
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, "data"); v.setUint32(40, samples.length * 2, true)
  return new Blob([header, samples.buffer as ArrayBuffer], { type: "audio/wav" })
}

export async function createListener(h: ListenerHandlers, opts: { manual?: boolean } = {}): Promise<Listener> {
  const manual = Boolean(opts.manual)
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 }, // no auto-gain: it would lift far-away voices to the level of yours
  })
  const ac = audioContext()
  await ac.resume()
  const source = ac.createMediaStreamSource(stream)
  const proc = ac.createScriptProcessor(2048, 1, 1)
  const analyser = ac.createAnalyser()
  analyser.fftSize = 1024
  const spectrum = new Float32Array(analyser.frequencyBinCount)
  source.connect(analyser)
  const mute = ac.createGain()
  mute.gain.value = 0 // the processor only runs when connected to the output; this keeps it silent
  source.connect(proc)
  proc.connect(mute)
  mute.connect(ac.destination)

  const ratio = ac.sampleRate / RATE
  let strict = false
  let noise = 0.01 // running estimate of the room's background loudness
  let lastLevel = 0
  let loudFrames = 0
  let active = false
  let silenceMs = 0
  let voicedMs = 0
  let samplesIn = 0
  const pre: Int16Array[] = []
  let preMs = 0
  let utter: Int16Array[] = []
  let utterSamples = 0
  let baseline: number | null = null // your usual speaking level
  let gateOpen = false
  let levels: number[] = []
  let bands: number[] = []
  let fracPos = 0 // where the next 16 kHz sample falls inside the incoming audio
  let prev = 0

  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    // Loudness of this frame.
    let sum = 0
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
    const rms = Math.sqrt(sum / input.length)
    lastLevel = rms
    const frameMs = (input.length / ac.sampleRate) * 1000

    // Down-sample to 16 kHz with linear interpolation. `pos` may start just before this frame: then the sample before it is `prev`.
    const out: number[] = []
    let pos = fracPos
    while (pos + 1 < input.length) {
      const i = Math.floor(pos)
      const a = i < 0 ? prev : input[i]
      const b = input[i + 1]
      out.push(a + (b - a) * (pos - i))
      pos += ratio
    }
    fracPos = pos - input.length
    prev = input[input.length - 1]
    const chunk = new Int16Array(out.length)
    for (let i = 0; i < out.length; i++) chunk[i] = Math.max(-1, Math.min(1, out[i])) * 32767

    // Voice or not: louder than the room by a margin (a higher margin while Jarvis is talking).
    const threshold = Math.max(0.012, noise * 3) * (strict ? 2.4 : 1)
    const loud = manual ? gateOpen : rms > threshold
    if (!active) {
      if (!loud) noise = noise * 0.95 + rms * 0.05
      loudFrames = loud ? loudFrames + 1 : 0
      pre.push(chunk)
      preMs += frameMs
      while (preMs > PRE_ROLL_MS && pre.length > 1) { preMs -= (pre[0].length / RATE) * 1000; pre.shift() }
      if (loudFrames >= (manual ? 1 : strict ? 3 : 2)) {
        active = true
        levels = []
        bands = []
        utter = pre.splice(0)
        utterSamples = utter.reduce((n, c) => n + c.length, 0)
        preMs = 0
        silenceMs = 0
        voicedMs = loudFrames * frameMs
        samplesIn = utterSamples
        h.onSpeechStart()
      }
      return
    }

    utter.push(chunk)
    utterSamples += chunk.length
    samplesIn = utterSamples
    if (loud) {
      silenceMs = 0
      voicedMs += frameMs
      levels.push(rms)
      analyser.getFloatFrequencyData(spectrum)
      bands.push(bandRatio(spectrum, ac.sampleRate))
    } else if (manual ? false : rms < threshold * 0.6) silenceMs += frameMs
    const lengthMs = (samplesIn / RATE) * 1000
    const released = manual && !gateOpen
    if (released || silenceMs >= END_SILENCE_MS || lengthMs >= MAX_MS) {
      const all = new Int16Array(utterSamples)
      let at = 0
      for (const c of utter) { all.set(c, at); at += c.length }
      const stats: UtteranceStats = { voicedMs, levels, band: bands.length ? bands.reduce((a, b) => a + b, 0) / bands.length : 0 }
      const verdict = judge(stats, baseline, manual)
      active = false; utter = []; utterSamples = 0; loudFrames = 0; silenceMs = 0; voicedMs = 0
      if (verdict.ok) { baseline = nextBaseline(baseline, stats); h.onUtterance(wav(all)) }
      else h.onUtterance(new Blob([], { type: "audio/wav" })) // the room, not you: lets the caller undo "speech started"
    }
  }

  return {
    stop() {
      proc.onaudioprocess = null
      try { source.disconnect(); analyser.disconnect(); proc.disconnect(); mute.disconnect() } catch { /* already disconnected */ }
      for (const t of stream.getTracks()) t.stop()
    },
    setStrict(on) { strict = on },
    setGate(open) { gateOpen = open },
    level: () => Math.min(1, lastLevel * 8),
  }
}
