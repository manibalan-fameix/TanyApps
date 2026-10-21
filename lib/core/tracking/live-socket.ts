// Browser side of the live-location WebSocket, shared by the rider's page and the guest's page.
// It asks the app for a ticket, connects, keeps the connection alive, and reconnects with a growing pause if it drops.

export type LiveSocket = {
  /** Sends text when connected; returns whether it was sent. */
  send(text: string): boolean
  isOpen(): boolean
  /** Stops for good: no more reconnects. */
  close(): void
}

type Ticket = { url: string; ticket: string } | null

const PING_MS = 25_000
const MIN_PAUSE_MS = 1000
const MAX_PAUSE_MS = 30_000

/**
 * @param getTicket asks the app for a fresh ticket; null means "no live channel" (then nothing connects)
 * @param onMessage receives each text message
 * @param onState told when the connection opens or drops
 * @param shouldStop called before each reconnect; return true when the delivery is over so it stops trying
 */
export function openLiveSocket(opts: { getTicket: () => Promise<Ticket>; onMessage?: (text: string) => void; onState?: (open: boolean) => void; shouldStop?: () => boolean }): LiveSocket {
  let ws: WebSocket | null = null
  let closed = false
  let pause = MIN_PAUSE_MS
  let retry: ReturnType<typeof setTimeout> | null = null
  let ping: ReturnType<typeof setInterval> | null = null

  const clearTimers = () => {
    if (retry) clearTimeout(retry)
    if (ping) clearInterval(ping)
    retry = ping = null
  }

  const later = () => {
    if (closed || retry) return
    // Jitter, so many phones do not reconnect in the same instant after an outage.
    retry = setTimeout(() => {
      retry = null
      void connect()
    }, pause * (0.75 + Math.random() * 0.5))
    pause = Math.min(pause * 2, MAX_PAUSE_MS)
  }

  async function connect() {
    if (closed || opts.shouldStop?.()) return
    let t: Ticket
    try {
      t = await opts.getTicket()
    } catch {
      return later()
    }
    if (closed) return
    if (!t) return // This deployment has no live channel; the caller keeps polling.
    try {
      ws = new WebSocket(`${t.url}?t=${encodeURIComponent(t.ticket)}`)
    } catch {
      return later()
    }
    const mine = ws
    mine.onopen = () => {
      pause = MIN_PAUSE_MS
      opts.onState?.(true)
      ping = setInterval(() => mine.readyState === WebSocket.OPEN && mine.send("ping"), PING_MS)
    }
    mine.onmessage = (e) => {
      if (typeof e.data === "string" && e.data !== "pong") opts.onMessage?.(e.data)
    }
    mine.onclose = (e) => {
      if (ping) clearInterval(ping)
      ping = null
      if (ws === mine) ws = null
      opts.onState?.(false)
      // 1000 means the delivery ended; 4000 means another page took over this connection.
      if (e.code === 1000 || e.code === 4000) closed = true
      else later()
    }
    mine.onerror = () => mine.close()
  }

  void connect()

  return {
    send: (text) => {
      if (ws?.readyState !== WebSocket.OPEN) return false
      ws.send(text)
      return true
    },
    isOpen: () => ws?.readyState === WebSocket.OPEN,
    close: () => {
      closed = true
      clearTimers()
      ws?.close(1000, "bye")
      ws = null
    },
  }
}
