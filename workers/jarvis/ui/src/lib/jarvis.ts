// Talks to the Jarvis Worker: the passphrase gate, /api/ask, /api/scribe-token and the Gemini voice.
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* private mode */ } },
}

export const VOICES = ["Zephyr", "Puck", "Kore", "Charon", "Aoede", "Leda", "Fenrir", "Orus", "device"]
export const getVoice = () => (VOICES.includes(store.get("voice") ?? "") ? (store.get("voice") as string) : "Zephyr")
export const setVoice = (v: string) => store.set("voice", v)

/** The block's language selector uses ISO codes. Only Tamil changes the reply language. */
export const replyLanguage = (code: string | null) => (code === "ta" ? "ta" : "en")

function passphrase(): string | null {
  let pass = store.get("pass")
  if (!pass) {
    pass = window.prompt("Passphrase")
    if (pass) store.set("pass", pass)
  }
  return pass
}

export async function api<T>(path: string, body: unknown): Promise<T> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${pass}` },
    body: JSON.stringify(body),
  })
  if (res.status === 401) {
    store.del("pass")
    throw new Error("Wrong passphrase. Try again.")
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || "Something went wrong.")
  return data as T
}

// One audio element for the whole session: iOS only lets it play if a tap started it, so unlockAudio() warms it up.
const player = new Audio()
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="
let audioUrl: string | null = null

export function unlockAudio() {
  try { player.src = SILENT; void player.play().catch(() => {}) } catch { /* ignore */ }
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(" ")
    u.volume = 0
    speechSynthesis.speak(u)
  }
}

export function stopAudio() {
  try { player.pause() } catch { /* ignore */ }
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null }
  if ("speechSynthesis" in window) speechSynthesis.cancel()
}

function deviceSpeak(text: string, lang: string, done: () => void) {
  if (!("speechSynthesis" in window) || !text) return done()
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === "ta" ? "ta-IN" : "en-IN"
  const voices = speechSynthesis.getVoices()
  const v = voices.find((x) => x.lang.replace("_", "-").toLowerCase().startsWith(u.lang.toLowerCase())) ?? voices.find((x) => x.lang.toLowerCase().startsWith(lang))
  if (v) u.voice = v
  u.onend = done
  u.onerror = done
  speechSynthesis.speak(u)
}

/** Says the text with the chosen Gemini voice, or the device voice when asked or when Gemini is unavailable. Resolves when it ends. */
export async function speakText(text: string, voice: string, lang: string, done: () => void): Promise<void> {
  if (!text) return
  stopAudio()
  if (voice === "device") return new Promise<void>((resolve) => deviceSpeak(text, lang, () => { done(); resolve() }))
  try {
    const pass = passphrase()
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${pass}` },
      body: JSON.stringify({ text, lang, voice }),
    })
    if (!res.ok) throw new Error("voice")
    audioUrl = URL.createObjectURL(await res.blob())
    player.src = audioUrl
    await new Promise<void>((resolve, reject) => {
      player.onended = () => resolve()
      player.onerror = () => reject(new Error("play"))
      player.play().catch(reject)
    })
    done()
  } catch {
    await new Promise<void>((resolve) => deviceSpeak(text, lang, () => { done(); resolve() }))
  }
}
