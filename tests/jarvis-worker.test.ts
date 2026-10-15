import { afterEach, describe, expect, it, vi } from "vitest"

import worker from "../workers/jarvis/index.mjs"
import { hearEvents } from "../scripts/jarvis/lib.mjs"

const env = { JARVIS_PASSPHRASE: "correct-horse-battery", JARVIS_TOKEN: "ghp_fake", GEMINI_API_KEY: "AIzaFake", ASSETS: { fetch: async () => new Response("<html>page</html>") } }

const board = {
  data: {
    user: {
      projectV2: {
        items: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              content: { number: 14, title: "[S14] Lead form", url: "https://x/14", state: "OPEN", body: "**Due:** 23 Oct", updatedAt: "2026-10-14T00:00:00Z", closedAt: null, labels: { nodes: [{ name: "TanyCars" }] }, assignees: { nodes: [] } },
              fieldValues: { nodes: [{ name: "Sprint 1", field: { name: "Sprint" } }, { name: "Urgent", field: { name: "Priority" } }, { number: 5, field: { name: "Points" } }, { text: "Gokul", field: { name: "Team" } }] },
            },
          ],
        },
      },
    },
  },
}

function stubNetwork() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes("api.github.com/graphql")) return new Response(JSON.stringify(board))
      if (u.includes("generativelanguage.googleapis.com") && u.includes("tts")) {
        // Two chunks of 16-bit PCM (4 bytes each), as server-sent events.
        const chunk = (b: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: btoa(b) } }] } }] })}\n\n`
        return new Response(chunk("abcd") + chunk("efgh"), { headers: { "content-type": "text/event-stream" } })
      }
      if (u.includes("streamGenerateContent")) {
        const sse = ["Task 14 is open.", " It is due on 23 October."].map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`).join("")
        return new Response(sse, { headers: { "content-type": "text/event-stream" } })
      }
      if (u.includes("generativelanguage.googleapis.com")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Task 14 is open." }] } }] }))
      return new Response("{}", { status: 404 })
    })
  )
}

const call = (path: string, body: unknown, pass = "correct-horse-battery") =>
  worker.fetch(new Request(`https://x${path}`, { method: "POST", headers: { authorization: `Bearer ${pass}`, "content-type": "application/json" }, body: JSON.stringify(body) }), env)

afterEach(() => vi.unstubAllGlobals())

describe("Jarvis worker", () => {
  it("serves the page from assets and refuses unknown API paths", async () => {
    expect(await (await worker.fetch(new Request("https://x/"), env)).text()).toContain("page")
    expect((await call("/api/nope", { text: "x" })).status).toBe(404)
  })

  it("rejects a missing or wrong passphrase", async () => {
    stubNetwork()
    expect((await call("/api/ask", { text: "hi" }, "wrong")).status).toBe(401)
    expect((await call("/api/speak", { text: "hi" }, "")).status).toBe(401)
  })

  it("rejects an empty question", async () => {
    stubNetwork()
    expect((await call("/api/ask", { text: "   " })).status).toBe(400)
  })

  it("answers a question from the board, as plain sentences", async () => {
    stubNetwork()
    const res = await call("/api/ask", { text: "What is open?" })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { answer: string; speech: string }
    expect(json.answer).toBe("Task 14 is open.")
    expect(json.speech).not.toMatch(/[*#`\[\]]/)
  })

  it("streams the answer in pieces so speech can start early", async () => {
    stubNetwork()
    const res = await call("/api/ask", { text: "What is open?", stream: true })
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const body = await res.text()
    const deltas = [...body.matchAll(/data: (.*)\n/g)].map((m) => JSON.parse(m[1]))
    expect(deltas.filter((d) => d.delta).map((d) => d.delta).join("")).toBe("Task 14 is open. It is due on 23 October.")
    expect(deltas.at(-1)).toEqual({ done: true })
  })

  it("warms the board cache without a body", async () => {
    stubNetwork()
    const res = await call("/api/warm", {})
    expect(res.status).toBe(204)
  })

  it("streams spoken audio as raw PCM", async () => {
    stubNetwork()
    const res = await call("/api/speak", { text: "Hello", voice: "Kore" })
    expect(res.status).toBe(200)
    expect(res.headers.get("x-pcm-rate")).toBe("24000")
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(String.fromCharCode(...bytes)).toBe("abcdefgh")
  })

  it("tries other voice models when the first is unknown to the key", async () => {
    const seen: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url)
      seen.push(u.split("/models/")[1]?.split(":")[0] ?? "")
      if (u.includes("gemini-3.1-flash-tts-preview")) return new Response("{}", { status: 404 })
      const chunk = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: btoa("abcd") } }] } }] })}\n\n`
      return new Response(chunk, { headers: { "content-type": "text/event-stream" } })
    }))
    const res = await call("/api/speak", { text: "Hello" })
    expect(res.status).toBe(200)
    expect(seen.length).toBeGreaterThan(1)
  })

  it("explains why the voice failed instead of staying silent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })))
    const res = await call("/api/speak", { text: "Hello" })
    expect(res.status).toBe(502)
    expect(((await res.json()) as { detail: string }).detail).toContain("429")
  })
})

async function collect(pieces: string[]) {
  async function* gen() { for (const p of pieces) yield p }
  const out: unknown[] = []
  for await (const e of hearEvents(gen())) out.push(e)
  return out
}

describe("hearing a recorded question", () => {
  it("splits what was heard from the answer, however the text is chunked", async () => {
    expect(await collect(["Q: what is", " up\n\nTask 14", " is open."])).toEqual([{ heard: "what is up" }, { delta: "Task 14" }, { delta: " is open." }])
    expect(await collect(["Q: hello\n\nHi."])).toEqual([{ heard: "hello" }, { delta: "Hi." }])
  })

  it("reports silence and noise as no speech", async () => {
    expect(await collect(["NOSPEECH"])).toEqual([{ nospeech: true }])
    expect(await collect(["NO", "SPEECH"])).toEqual([{ nospeech: true }])
    expect(await collect(["Q: \n\n"])).toEqual([{ nospeech: true }])
  })

  it("still answers when the model forgets the Q line", async () => {
    expect(await collect(["Task 14 is open.\n", "It is urgent."])).toEqual([{ heard: "" }, { delta: "Task 14 is open.\n" }, { delta: "It is urgent." }])
  })

  it("turns an uploaded recording into heard text and an answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes("api.github.com/graphql")) return new Response(JSON.stringify(board))
      const sse = ["Q: is task 14 open?\n\n", "Yes, task 14 is open."].map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`).join("")
      return new Response(sse, { headers: { "content-type": "text/event-stream" } })
    }))
    const res = await worker.fetch(new Request("https://x/api/hear", { method: "POST", headers: { authorization: "Bearer correct-horse-battery", "x-lang": "en", "x-history": encodeURIComponent("[]") }, body: new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]) }), env)
    expect(res.status).toBe(200)
    const events = [...(await res.text()).matchAll(/data: (.*)\n/g)].map((m) => JSON.parse(m[1]))
    expect(events[0]).toEqual({ heard: "is task 14 open?" })
    expect(events.filter((e) => e.delta).map((e) => e.delta).join("")).toBe("Yes, task 14 is open.")
  })

  it("refuses an empty recording and a wrong passphrase", async () => {
    stubNetwork()
    const empty = await worker.fetch(new Request("https://x/api/hear", { method: "POST", headers: { authorization: "Bearer correct-horse-battery" }, body: new Uint8Array() }), env)
    expect(empty.status).toBe(400)
    const wrong = await worker.fetch(new Request("https://x/api/hear", { method: "POST", headers: { authorization: "Bearer nope" }, body: new Uint8Array([1]) }), env)
    expect(wrong.status).toBe(401)
  })
})
