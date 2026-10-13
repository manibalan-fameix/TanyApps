// Browser-only helpers.

export type Resized = { blob: Blob; width: number; height: number }

async function decode(source: Blob): Promise<ImageBitmap> {
  // imageOrientation: "from-image" applies the phone's EXIF rotation before we drop the metadata.
  return createImageBitmap(source, { imageOrientation: "from-image" })
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/jpeg", quality),
  )
}

/**
 * Downscale to `maxEdge` and re-encode as JPEG. Re-encoding through a canvas also strips EXIF,
 * including GPS coordinates, so a photo taken in the dealer's yard never leaks its location.
 */
export async function resizeToJpeg(source: Blob, maxEdge: number, quality = 0.85): Promise<Resized> {
  const bitmap = await decode(source)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable")
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { blob: await toBlob(canvas, quality), width, height }
}

/** Downscale to `maxEdge` and re-encode as PNG, keeping transparency. For logos. */
export async function resizeToPng(source: Blob, maxEdge: number): Promise<Blob> {
  const bitmap = await decode(source)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable")
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/png"),
  )
}

/** Center-crop to 4:5 portrait (Instagram carousel), 1080x1350. */
export async function cropPortrait45(source: Blob, width = 1080): Promise<Blob> {
  const bitmap = await decode(source)
  const height = Math.round((width * 5) / 4)
  const targetRatio = width / height
  let sw = bitmap.width
  let sh = bitmap.height
  if (sw / sh > targetRatio) sw = sh * targetRatio
  else sh = sw / targetRatio
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable")
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, width, height)
  bitmap.close()
  return toBlob(canvas, 0.9)
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Duration and size of a video file, read from its metadata. */
export function readVideoMeta(file: Blob): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    v.preload = "metadata"
    v.onloadedmetadata = () => {
      resolve({ durationSec: v.duration, width: v.videoWidth, height: v.videoHeight })
      URL.revokeObjectURL(url)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read video"))
    }
    v.src = url
  })
}
