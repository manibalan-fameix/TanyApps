import type { ReviewMediaItem } from "../db/schema/restaurant.ts"
import type { StorageAdapter } from "../storage/types.ts"

/** What a customer may attach to a review. One number to change if the video limit needs to move. */
export const MAX_REVIEW_PHOTOS = 5
export const MAX_REVIEW_VIDEOS = 1
export const MAX_REVIEW_VIDEO_BYTES = 25 * 1024 * 1024
/** A photo is shrunk in the browser to about 1280 px first, so it is far below this; the cap is a safety net. */
export const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024

export const REVIEW_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const
const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }

/** Where one customer's review file lives: under the shop and the customer, so a key can be checked against both. */
export const reviewMediaKey = (dealerId: string, customerId: string, id: string, ext: "jpg" | "mp4" | "mov" | "webm") => `dealers/${dealerId}/reviews/${customerId}/${id}.${ext}`
export const reviewVideoExt = (contentType: string) => VIDEO_EXT[contentType] as "mp4" | "mov" | "webm" | undefined

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/**
 * The attachments a customer sends with a review, checked before anything is saved: at most 5 photos and 1 video, every one a file
 * this customer uploaded to this shop (never a link to somewhere else), of the right kind for its type, and a video no bigger than
 * the limit. Returns the clean list, or an error to show.
 */
export async function checkReviewMedia(input: unknown, ctx: { storage: Pick<StorageAdapter, "publicUrl" | "head" | "remove">; dealerId: string; customerId: string }): Promise<{ ok: true; media: ReviewMediaItem[] } | { ok: false; error: string }> {
  if (input === undefined || input === null) return { ok: true, media: [] }
  if (!Array.isArray(input)) return { ok: false, error: "Those attachments could not be read." }
  const prefix = ctx.storage.publicUrl(`dealers/${ctx.dealerId}/reviews/${ctx.customerId}/`)
  const imageRe = new RegExp(`^${UUID}\\.jpg$`)
  const videoRe = new RegExp(`^${UUID}\\.(mp4|mov|webm)$`)
  const media: ReviewMediaItem[] = []
  for (const raw of input) {
    const item = raw as { type?: unknown; url?: unknown }
    const url = typeof item?.url === "string" ? item.url : ""
    const name = url.startsWith(prefix) ? url.slice(prefix.length) : ""
    if ((item?.type !== "image" && item?.type !== "video") || !name || name.includes("/") || name.includes("..")) return { ok: false, error: "Upload the photos and video again." }
    if (!(item.type === "image" ? imageRe : videoRe).test(name)) return { ok: false, error: "Upload the photos and video again." }
    media.push({ type: item.type, url })
  }
  if (media.filter((m) => m.type === "image").length > MAX_REVIEW_PHOTOS) return { ok: false, error: `You can add up to ${MAX_REVIEW_PHOTOS} photos.` }
  if (media.filter((m) => m.type === "video").length > MAX_REVIEW_VIDEOS) return { ok: false, error: "You can add one video." }
  if (new Set(media.map((m) => m.url)).size !== media.length) return { ok: false, error: "The same file was added twice." }
  // The file must really be there, and a video must be within the limit (the browser's own check is only a courtesy).
  for (const m of media) {
    const key = `dealers/${ctx.dealerId}/reviews/${ctx.customerId}/${m.url.slice(prefix.length)}`
    const head = await ctx.storage.head(key)
    if (!head) return { ok: false, error: "A file did not finish uploading. Please add it again." }
    if (m.type === "video" && head.size > MAX_REVIEW_VIDEO_BYTES) {
      await ctx.storage.remove(key).catch(() => undefined)
      return { ok: false, error: `The video is larger than ${Math.round(MAX_REVIEW_VIDEO_BYTES / 1024 / 1024)} MB.` }
    }
  }
  return { ok: true, media }
}
