/**
 * A phone's first GPS answer is often a rough one (from Wi-Fi or mobile towers, hundreds of metres out) that sharpens
 * over the next few seconds. This watches for a while and keeps the best reading. Runs in the browser.
 */

/** Good enough to find a door: stop looking as soon as a reading is this tight, in metres. */
export const TARGET_ACCURACY_M = 20
/** Worse than this and the reading cannot be trusted to find a door: the guest has to place the pin themselves. */
export const ROUGH_ACCURACY_M = 75

export type Fix = { lat: number; lng: number; /** Radius in metres the phone is confident of. */ accuracy: number }

/** The parts of navigator.geolocation used here, so a test can stand in for the phone. */
export type PositionSource = Pick<Geolocation, "watchPosition" | "clearWatch">

export type AccurateOptions = { targetM?: number; maxWaitMs?: number; onProgress?: (fix: Fix) => void }

/**
 * Resolves with the first reading within `targetM`, or else the best one seen after `maxWaitMs`. Rejects with the
 * browser's own error code: 1 blocked, 2 unavailable, 3 timed out.
 */
export function accuratePosition(source: PositionSource, { targetM = TARGET_ACCURACY_M, maxWaitMs = 15_000, onProgress }: AccurateOptions = {}): Promise<Fix> {
  return new Promise((resolve, reject) => {
    let best: Fix | null = null
    let done = false
    let watch: number | null = null
    const finish = (error?: { code: number }) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (watch !== null) source.clearWatch(watch)
      if (best) resolve(best)
      else reject(error ?? { code: 3 })
    }
    const timer = setTimeout(() => finish(), maxWaitMs)
    watch = source.watchPosition(
      (p) => {
        if (done) return
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
        if (best && fix.accuracy >= best.accuracy) return
        best = fix
        onProgress?.(fix)
        if (fix.accuracy <= targetM) finish()
      },
      // A blocked permission ends it at once. Other errors can be passing, so keep waiting for a reading.
      (e) => {
        if (e.code === 1) {
          best = null
          finish(e)
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    )
    // The phone may have answered before watchPosition returned.
    if (done) source.clearWatch(watch)
  })
}
