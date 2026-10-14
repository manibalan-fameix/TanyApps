import { afterEach, describe, expect, it, vi } from "vitest"

// @ts-expect-error plain JavaScript Worker
import worker from "../workers/jarvis/index.mjs"

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
        const pcm = btoa("abcd")
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm } }] } }] }))
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

  it("returns spoken audio as a WAV file", async () => {
    stubNetwork()
    const res = await call("/api/speak", { text: "Hello", voice: "Kore" })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("audio/wav")
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF")
  })

  it("explains why the voice failed instead of staying silent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })))
    const res = await call("/api/speak", { text: "Hello" })
    expect(res.status).toBe(502)
    expect(((await res.json()) as { detail: string }).detail).toContain("429")
  })
})
