// Browser-only. Turns a walkaround mp4 into a few small frames and a compact audio track, so the
// video itself never has to be uploaded to read it.
import { encodeWav, frameTimes } from "./wav"

export const FRAME_COUNT = 12
const FRAME_EDGE = 768
const AUDIO_RATE = 16_000
const MAX_AUDIO_SEC = 180
/** Decoding audio needs the whole file in memory; beyond this we read the frames only. */
const MAX_AUDIO_FILE_BYTES = 200 * 1024 * 1024

export type ExtractedVideo = { frames: Blob[]; audio: Blob | null; durationSec: number }
export class VideoReadError extends Error {}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => (video.removeEventListener("seeked", done), video.removeEventListener("error", fail), resolve())
    const fail = () => (video.removeEventListener("seeked", done), video.removeEventListener("error", fail), reject(new VideoReadError("seek failed")))
    video.addEventListener("seeked", done)
    video.addEventListener("error", fail)
    video.currentTime = t
  })
}

async function grabFrames(file: File, onProgress: (p: number) => void): Promise<{ frames: Blob[]; durationSec: number }> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement("video")
    video.muted = true
    video.preload = "auto"
    video.playsInline = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new VideoReadError("This video format can't be read in the browser."))
    })
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth) throw new VideoReadError("Could not read this video.")

    const scale = Math.min(1, FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new VideoReadError("Canvas unavailable")

    const frames: Blob[] = []
    const times = frameTimes(duration, FRAME_COUNT)
    for (const [i, t] of times.entries()) {
      await seek(video, t)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.72))
      if (blob) frames.push(blob)
      onProgress((i + 1) / times.length)
    }
    return { frames, durationSec: duration }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Mono 16 kHz WAV of the first few minutes. Null when the video has no audio or the browser cannot decode it. */
async function grabAudio(file: File): Promise<Blob | null> {
  if (file.size > MAX_AUDIO_FILE_BYTES) return null
  try {
    const ctx = new AudioContext()
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer())
    void ctx.close()
    const seconds = Math.min(decoded.duration, MAX_AUDIO_SEC)
    // Rendering through an OfflineAudioContext downmixes to mono and resamples in one step.
    const offline = new OfflineAudioContext(1, Math.ceil(seconds * AUDIO_RATE), AUDIO_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const samples = (await offline.startRendering()).getChannelData(0)
    // Near-silence (background music only, or no track) is not worth sending.
    let peak = 0
    for (let i = 0; i < samples.length; i += 97) peak = Math.max(peak, Math.abs(samples[i]))
    if (peak < 0.01) return null
    return new Blob([encodeWav(samples, AUDIO_RATE) as BlobPart], { type: "audio/wav" })
  } catch {
    return null
  }
}

export async function extractFromVideo(file: File, onProgress: (p: number) => void = () => {}): Promise<ExtractedVideo> {
  const { frames, durationSec } = await grabFrames(file, onProgress)
  if (frames.length === 0) throw new VideoReadError("Could not read this video.")
  return { frames, audio: await grabAudio(file), durationSec }
}
