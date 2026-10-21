"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, CloudUploadIcon } from "@hugeicons/core-free-icons"

import {
  confirmUploadAction,
  requestUploadAction,
} from "@/app/(admin)/(shell)/cars/actions"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { copy } from "@/lib/copy"
import { idbAvailable, idbStore, memoryStore } from "@/lib/upload/idb"
import {
  PermanentUploadError,
  UploadQueue,
  type UploadItem,
  type UploadTransport,
} from "@/lib/upload/queue"

type EnqueueInput = Parameters<UploadQueue["enqueue"]>[0]

type Ctx = {
  ready: boolean
  online: boolean
  items: (carId?: string) => UploadItem[]
  enqueue: (input: EnqueueInput) => Promise<void>
  retryFailed: (carId?: string) => Promise<void>
  /** Bumps whenever any item changes, so consumers re-render. */
  version: number
}

const UploadContext = createContext<Ctx | null>(null)

export function useUploads(): Ctx {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error("useUploads must be used inside <UploadProvider>")
  return ctx
}

const PERMANENT = new Set([
  "invalid",
  "too_large",
  "too_many",
  "not_found",
  "car_closed",
  "unauthorised",
])

const transport: UploadTransport = {
  async request(item) {
    if (!item.blob) throw new PermanentUploadError("Nothing to upload")
    const res = await requestUploadAction({
      carId: item.carId,
      uploadId: item.id,
      kind: item.kind,
      angle: item.angle,
      contentType: item.contentType,
      size: item.blob.size,
    })
    if (!res.ok) {
      if (PERMANENT.has(res.error)) throw new PermanentUploadError(res.error)
      throw new Error(res.error)
    }
    return { ...res.target, mediaId: res.mediaId }
  },
  async send(target, blob, onProgress) {
    // XMLHttpRequest, not fetch: fetch cannot report how many bytes of an upload have gone out.
    const status = await new Promise<number>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(target.method, target.url)
      for (const [k, v] of Object.entries(target.headers))
        xhr.setRequestHeader(k, v)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total)
      }
      xhr.onload = () => resolve(xhr.status)
      xhr.onerror = () => reject(new Error("Network error"))
      xhr.ontimeout = () => reject(new Error("Upload timed out"))
      xhr.onabort = () => reject(new Error("Upload cancelled"))
      xhr.send(blob)
    })
    if (status >= 200 && status < 300) return
    // 4xx (other than timeout / rate limit) will not fix itself; 5xx and network errors will.
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      throw new PermanentUploadError(`Storage refused the upload (${status})`)
    }
    throw new Error(`Storage error (${status})`)
  },
  async confirm(item, target) {
    const res = await confirmUploadAction({
      carId: item.carId,
      mediaId: target.mediaId,
      width: item.width,
      height: item.height,
      durationSec: item.durationSec,
    })
    if (res.ok) return
    if (res.error === "not_uploaded") throw new Error("Upload not visible yet") // retry shortly
    if (PERMANENT.has(res.error)) throw new PermanentUploadError(res.error)
    throw new Error(res.error)
  },
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Owns the browser's upload queue for the whole admin session, so uploads survive navigation. */
export function UploadProvider({ children }: { children: React.ReactNode }) {
  const queue = useRef<UploadQueue | null>(null)
  const pumping = useRef(false)
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(true)
  const [version, setVersion] = useState(0)

  const pump = useCallback(async () => {
    const q = queue.current
    if (!q || pumping.current) return
    pumping.current = true
    try {
      for (;;) {
        // While offline, wait for the network rather than burning retry attempts.
        if (!navigator.onLine) break
        if (await q.tick()) continue
        const wait = q.nextWakeMs()
        if (wait === null) break
        await sleep(Math.min(Math.max(wait, 250), 5000))
      }
    } finally {
      pumping.current = false
    }
  }, [])

  useEffect(() => {
    let unsub: (() => void) | undefined
    let dead = false
    void (async () => {
      const store = (await idbAvailable()) ? idbStore : memoryStore()
      const q = new UploadQueue(store, transport)
      await q.load()
      if (dead) return
      queue.current = q
      unsub = q.subscribe(() => setVersion((v) => v + 1))
      setOnline(navigator.onLine)
      setReady(true)
      void pump()
    })()

    const goOnline = () => {
      setOnline(true)
      void pump()
    }
    const goOffline = () => setOnline(false)
    const visible = () => document.visibilityState === "visible" && void pump()
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    document.addEventListener("visibilitychange", visible)
    return () => {
      dead = true
      unsub?.()
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [pump])

  const value = useMemo<Ctx>(
    () => ({
      ready,
      online,
      version,
      items: (carId) => queue.current?.list(carId) ?? [],
      enqueue: async (input) => {
        await queue.current?.enqueue(input)
        void pump()
      },
      retryFailed: async (carId) => {
        await queue.current?.retryFailed(carId)
        void pump()
      },
    }),
    // `version` intentionally re-creates the value so consumers see fresh items.
    [ready, online, version, pump]
  )

  return (
    <UploadContext.Provider value={value}>
      {children}
      <UploadPill />
    </UploadContext.Provider>
  )
}

/** Floating status across the admin: what is still uploading, offline notice, retry for failures. */
function UploadPill() {
  const { items, online, retryFailed } = useUploads()
  const all = items()
  const pending = all.filter(
    (i) => i.state === "queued" || i.state === "uploading"
  )
  const failed = all.filter((i) => i.state === "failed")
  if (pending.length === 0 && failed.length === 0) return null

  const done = all.filter((i) => i.state === "done").length
  const total = all.length
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-card p-3 text-card-foreground shadow-lg ring-1 ring-foreground/10 max-md:bottom-[calc(5rem+var(--safe-area-inset-bottom))]"
    >
      <HugeiconsIcon
        icon={failed.length ? Alert02Icon : CloudUploadIcon}
        strokeWidth={2}
        className="size-5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {failed.length && !pending.length
            ? copy.admin.uploadPill.failed(failed.length)
            : !online
              ? copy.admin.uploadPill.offline
              : copy.admin.uploadPill.uploading(pending.length)}
        </p>
        {pending.length > 0 && (
          <Progress
            value={
              total
                ? ((done + pending.reduce((n, i) => n + (i.progress ?? 0), 0)) /
                    total) *
                  100
                : 0
            }
            className="mt-1.5"
          />
        )}
      </div>
      {failed.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => void retryFailed()}>
          {copy.admin.uploadPill.retry}
        </Button>
      )}
    </div>
  )
}
