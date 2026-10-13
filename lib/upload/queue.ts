import { angleOrder, HERO_ANGLE, type CarAngle } from "../angles.ts"

export type UploadItem = {
  /** Client-generated id; also part of the storage key, so retries reuse the same server slot. */
  id: string
  carId: string
  kind: "photo" | "video"
  angle?: CarAngle
  contentType: string
  /** Dropped once the upload is done, to free device storage. */
  blob: Blob | null
  width?: number
  height?: number
  durationSec?: number
  state: "queued" | "uploading" | "done" | "failed"
  attempts: number
  nextAttemptAt: number
  error?: string
  createdAt: number
  /** 0 to 1 while the bytes are being sent. Live only: never stored. */
  progress?: number
}

export interface UploadStore {
  put(item: UploadItem): Promise<void>
  delete(id: string): Promise<void>
  all(): Promise<UploadItem[]>
}

export type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string>; mediaId: string }

export interface UploadTransport {
  /** Ask the server for a slot and a presigned URL. Idempotent per item id. */
  request(item: UploadItem): Promise<UploadTarget>
  /** Send the bytes straight to storage. */
  send(target: UploadTarget, blob: Blob, onProgress?: (fraction: number) => void): Promise<void>
  /** Tell the server the bytes landed. */
  confirm(item: UploadItem, target: UploadTarget): Promise<void>
}

/** Throw from a transport step for errors that retrying can never fix (validation, permissions). */
export class PermanentUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PermanentUploadError"
  }
}

export type Progress = { total: number; done: number; queued: number; uploading: number; failed: number }

const MAX_ATTEMPTS = 8
const DONE_RETENTION_MS = 24 * 3_600_000
export const backoffMs = (attempts: number) => Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1))

/**
 * Offline-safe upload queue. Items live in a durable store (IndexedDB in the browser) until they
 * finish, so a closed tab, a dead battery or a dropped signal loses nothing. Uploads run one at a
 * time (kind to slow mobile links), hero image first, video last.
 */
export class UploadQueue {
  private items = new Map<string, UploadItem>()
  private listeners = new Set<() => void>()
  private running = false
  /** Send progress per item id. Kept out of the store: it is meaningless after a reload. */
  private sent = new Map<string, number>()

  constructor(
    private store: UploadStore,
    private transport: UploadTransport,
    private now: () => number = Date.now,
  ) {}

  /** Restore from the store. Items caught mid-upload by a crash go back to the queue. */
  async load() {
    for (const item of await this.store.all()) {
      if (item.state === "done" && this.now() - item.createdAt > DONE_RETENTION_MS) {
        await this.store.delete(item.id)
        continue
      }
      this.items.set(item.id, item.state === "uploading" ? { ...item, state: "queued" } : item)
    }
    this.emit()
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  private emit() {
    for (const l of this.listeners) l()
  }

  list(carId?: string): UploadItem[] {
    return [...this.items.values()]
      .filter((i) => !carId || i.carId === carId)
      .map((i) => (this.sent.has(i.id) ? { ...i, progress: this.sent.get(i.id) } : i))
  }

  progress(carId: string): Progress {
    const list = this.list(carId)
    const count = (s: UploadItem["state"]) => list.filter((i) => i.state === s).length
    return { total: list.length, done: count("done"), queued: count("queued"), uploading: count("uploading"), failed: count("failed") }
  }

  async enqueue(input: Omit<UploadItem, "state" | "attempts" | "nextAttemptAt" | "createdAt" | "error">) {
    // A retake supersedes any photo for the same angle that has not finished yet.
    if (input.kind === "photo") {
      for (const old of this.list(input.carId)) {
        if (old.kind === "photo" && old.angle === input.angle && old.state !== "done" && old.state !== "uploading") {
          this.items.delete(old.id)
          await this.store.delete(old.id)
        }
      }
    }
    const item: UploadItem = { ...input, state: "queued", attempts: 0, nextAttemptAt: 0, createdAt: this.now() }
    this.items.set(item.id, item)
    await this.store.put(item)
    this.emit()
  }

  /** Put failed items back in line (the user tapped "Retry"). */
  async retryFailed(carId?: string) {
    for (const item of this.list(carId)) {
      if (item.state !== "failed") continue
      await this.save({ ...item, state: "queued", attempts: 0, nextAttemptAt: 0, error: undefined })
    }
  }

  /** Hero first, then the remaining angles in capture order, then video. */
  private nextDue(): UploadItem | undefined {
    const rank = (i: UploadItem) => (i.kind === "video" ? 1000 : i.angle === HERO_ANGLE ? -1 : angleOrder(i.angle!))
    return [...this.items.values()]
      .filter((i) => i.state === "queued" && i.nextAttemptAt <= this.now())
      .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)[0]
  }

  /** Time until the next queued item is due, or null if nothing is waiting. */
  nextWakeMs(): number | null {
    const waits = [...this.items.values()].filter((i) => i.state === "queued").map((i) => Math.max(0, i.nextAttemptAt - this.now()))
    return waits.length ? Math.min(...waits) : null
  }

  private async save(item: UploadItem) {
    this.items.set(item.id, item)
    await this.store.put(item)
    this.emit()
  }

  /** Process one due item. Returns false when there was nothing to do. */
  async tick(): Promise<boolean> {
    if (this.running) return false
    const item = this.nextDue()
    if (!item || !item.blob) return false
    this.running = true
    try {
      await this.save({ ...item, state: "uploading" })
      const target = await this.transport.request(item)
      await this.transport.send(target, item.blob, (fraction) => {
        // Only repaint on visible steps: progress events arrive many times a second.
        const next = Math.min(1, Math.max(0, fraction))
        if (next - (this.sent.get(item.id) ?? 0) >= 0.02 || next === 1) {
          this.sent.set(item.id, next)
          this.emit()
        }
      })
      await this.transport.confirm(item, target)
      await this.save({ ...item, state: "done", blob: null, error: undefined })
    } catch (e) {
      const attempts = item.attempts + 1
      const message = e instanceof Error ? e.message : "Upload failed"
      const permanent = e instanceof PermanentUploadError || attempts >= MAX_ATTEMPTS
      await this.save(
        permanent
          ? { ...item, state: "failed", attempts, error: message }
          : { ...item, state: "queued", attempts, nextAttemptAt: this.now() + backoffMs(attempts), error: message },
      )
    } finally {
      this.sent.delete(item.id)
      this.running = false
    }
    return true
  }

  async runUntilIdle() {
    while (await this.tick());
  }
}
