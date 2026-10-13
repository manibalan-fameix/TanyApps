// Just enough of the Workers runtime types for this repo's type check. The real types come from Cloudflare's
// runtime when the Worker is bundled by wrangler.
declare module "cloudflare:workers" {
  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>
    put(key: string, value: unknown): Promise<void>
    deleteAll(): Promise<void>
    setAlarm(scheduledTime: number): Promise<void>
  }
  interface DurableObjectState {
    storage: DurableObjectStorage
    acceptWebSocket(ws: WebSocket, tags?: string[]): void
    getWebSockets(tag?: string): WebSocket[]
    getTags(ws: WebSocket): string[]
    setWebSocketAutoResponse(pair: WebSocketRequestResponsePair): void
  }
  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectState, env: Env)
    protected ctx: DurableObjectState
    protected env: Env
  }
}

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}
declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string)
}
