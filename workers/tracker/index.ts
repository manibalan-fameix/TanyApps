// Live-location tracker for deliveries. Runs on Cloudflare as its own small Worker (deploy with `pnpm run deploy:tracker staging|production`).
//
// Every order gets one Durable Object. It keeps the rider's latest position (so a page that opens late sees it at once)
// and relays each new position to everyone watching, over WebSockets. The rider's phone sends tiny messages, the
// customer's phone receives them, and no map service is involved in that traffic at all.
//
// Two ways in:
//  - the main app talks to the objects through a binding (put / get / clear), as before;
//  - phones connect to wss://<this worker>/ws?t=<ticket>. The ticket is signed by the app after it has checked the
//    rider's link or the guest's order code, so this Worker needs no database.
//
// WebSocket Hibernation is used: an idle connection costs nothing, and the object only wakes for a message.
import { DurableObject } from "cloudflare:workers"

import { slideWindow } from "../../lib/core/rate-window"
import { verifyTicket } from "../../lib/core/tracking/ws-ticket"

type RouteKept = { points: [number, number][]; km: number; minutes: number; at: number; to: { lat: number; lng: number } }
type Fix = { lat: number; lng: number; accuracy: number | null; heading: number | null; at: number }

/** Positions are only useful for the length of a delivery, so each object deletes itself after a few hours. */
const KEEP_MS = 6 * 3_600_000
/** A rider's phone sends about every 5 seconds; anything faster than this is dropped. */
const MIN_GAP_MS = 1000

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)
// India, with some margin: the same rule the app applies.
const inIndia = (lat: number, lng: number) => lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98.5

type Env = { TRACKER: DurableObjectNamespaceLike; TRACKER_SECRET?: string; ALLOWED_ROOT?: string }
type DurableObjectNamespaceLike = { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } }

export class OrderTracker extends DurableObject {
  private lastAt = 0

  constructor(ctx: ConstructorParameters<typeof DurableObject>[0], env: unknown) {
    super(ctx, env)
    // Keep-alive pings are answered without waking the object.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))
  }

  /** Stores the latest position. Older fixes (a delayed request arriving late) never overwrite a newer one. */
  async put(fix: Fix): Promise<void> {
    if (!finite(fix?.lat) || !finite(fix?.lng) || !finite(fix?.at)) throw new Error("invalid fix")
    const current = await this.ctx.storage.get<Fix>("fix")
    if (current && current.at > fix.at) return
    const clean: Fix = { lat: fix.lat, lng: fix.lng, accuracy: finite(fix.accuracy) ? fix.accuracy : null, heading: finite(fix.heading) ? fix.heading : null, at: fix.at }
    await this.ctx.storage.put("fix", clean)
    await this.ctx.storage.setAlarm(Date.now() + KEEP_MS)
    this.broadcast(clean)
  }

  async get(): Promise<Fix | null> {
    return (await this.ctx.storage.get<Fix>("fix")) ?? null
  }

  /**
   * The road route for this delivery. It is looked up once and shared: the rider's page, the customer's page and the
   * restaurant's board all read this copy instead of each asking a map service, until the rider leaves the road.
   */
  async putRoute(route: RouteKept): Promise<void> {
    if (!Array.isArray(route?.points) || route.points.length < 2 || route.points.length > 400 || !finite(route.km) || !finite(route.minutes) || !finite(route.at)) throw new Error("invalid route")
    await this.ctx.storage.put("route", route)
    await this.ctx.storage.setAlarm(Date.now() + KEEP_MS)
  }

  async getRoute(): Promise<RouteKept | null> {
    return (await this.ctx.storage.get<RouteKept>("route")) ?? null
  }

  /** The delivery is over: forget the position and tell every viewer to stop. */
  async clear(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "done")
      } catch {
        // Already closed.
      }
    }
    await this.ctx.storage.deleteAll()
  }

  async alarm(): Promise<void> {
    await this.clear()
  }

  /** A phone connecting with a valid ticket (checked by the Worker's fetch below, which passes the role on). */
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 })
    const role = req.headers.get("x-role") === "rider" ? "rider" : "guest"
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]
    if (role === "rider") {
      // One rider connection at a time: a reopened page takes over from the old one.
      for (const old of this.ctx.getWebSockets("rider")) old.close(4000, "replaced")
    }
    this.ctx.acceptWebSocket(server, [role])
    // A viewer who opens late sees the rider straight away.
    if (role === "guest") {
      const fix = await this.get()
      if (fix) server.send(encode(fix))
    }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit)
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.ctx.getTags(ws).includes("rider") || typeof message !== "string" || message.length > 200) return
    const now = Date.now()
    if (now - this.lastAt < MIN_GAP_MS) return
    let data: unknown
    try {
      data = JSON.parse(message)
    } catch {
      return
    }
    // [lat, lng, heading, accuracy], heading and accuracy optional.
    if (!Array.isArray(data) || !finite(data[0]) || !finite(data[1]) || !inIndia(data[0], data[1])) return
    this.lastAt = now
    const heading = finite(data[2]) && data[2] >= 0 && data[2] <= 360 ? data[2] : null
    const accuracy = finite(data[3]) && data[3] >= 0 && data[3] <= 100_000 ? data[3] : null
    await this.put({ lat: Math.round(data[0] * 1e6) / 1e6, lng: Math.round(data[1] * 1e6) / 1e6, heading, accuracy, at: now })
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    // 1005/1006 are reserved and cannot be sent back.
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye")
    } catch {
      // Already closed.
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error")
    } catch {
      // Already closed.
    }
  }

  private broadcast(fix: Fix) {
    const text = encode(fix)
    for (const ws of this.ctx.getWebSockets("guest")) {
      try {
        ws.send(text)
      } catch {
        // The viewer went away; the runtime cleans the connection up.
      }
    }
  }
}

/**
 * One sliding-window rate limit per object (the app names the object after a hash of the limit's key). The timestamps of
 * recent hits are persisted, so the count survives the object being evicted from memory. At most `limit` timestamps are
 * ever stored, and an alarm clears the object once its window has passed.
 */
export class RateLimiter extends DurableObject {
  /** Records a hit and answers whether it is within `limit` hits per `windowMs`. */
  async hit(limit: number, windowMs: number): Promise<boolean> {
    if (!finite(limit) || !finite(windowMs) || limit < 1 || windowMs < 1 || windowMs > 24 * 3_600_000) throw new Error("invalid limit")
    const now = Date.now()
    const { allowed, hits } = slideWindow((await this.ctx.storage.get<number[]>("hits")) ?? [], now, limit, windowMs)
    await this.ctx.storage.put("hits", hits)
    await this.ctx.storage.setAlarm(now + windowMs)
    return allowed
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}

/** What a viewer receives: [lat, lng, heading, time]. Four numbers, about 40 bytes. */
const encode = (fix: Fix) => JSON.stringify([fix.lat, fix.lng, fix.heading, fix.at])

/** Whether a page on this origin may open a connection. Browsers do not apply CORS to WebSockets, so it is checked here. */
function originAllowed(origin: string | null, root: string | undefined): boolean {
  if (!origin) return false
  try {
    const host = new URL(origin).hostname
    if (root && (host === root || host.endsWith(`.${root}`))) return true
    return host === "localhost" || host.endsWith(".localhost")
  } catch {
    return false
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname !== "/ws") return new Response("Not found", { status: 404 })
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 })
    if (!originAllowed(req.headers.get("Origin"), env.ALLOWED_ROOT)) return new Response("Forbidden", { status: 403 })
    const claims = await verifyTicket(env.TRACKER_SECRET ?? "", url.searchParams.get("t"))
    if (!claims) return new Response("Unauthorized", { status: 401 })
    const stub = env.TRACKER.get(env.TRACKER.idFromName(claims.k))
    const forward = new Request(req, { headers: new Headers({ Upgrade: "websocket", "x-role": claims.r }) })
    return stub.fetch(forward)
  },
}
