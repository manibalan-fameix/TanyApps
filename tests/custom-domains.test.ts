import { afterEach, describe, expect, it, vi } from "vitest"

import { cnameValue, domainStage, isBareDomain, parseCustomHostname, setupInstructions, shouldServe, splitHostname } from "../lib/domains/hostname"

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }))
vi.mock("../lib/tenant/lookup", () => ({
  resolveCustomDomain: vi.fn(async (host: string) => (host === "www.myshop.com" ? "my-shop" : null)),
  resolvePrimaryHost: vi.fn(async (slug: string) => (slug === "my-shop" ? "www.myshop.com" : null)),
  resolveShortLink: vi.fn(async () => null),
}))

describe("parseCustomHostname", () => {
  const parse = (v: string) => parseCustomHostname(v, "tany.in")
  it("accepts a name in front of an owned domain, however it is typed", () => {
    for (const v of ["www.myshop.com", " WWW.MyShop.com. ", "https://www.myshop.com/menu?x=1"]) {
      expect(parse(v), v).toEqual({ ok: true, hostname: "www.myshop.com" })
    }
    expect(parse("shop.myshop.co.in")).toEqual({ ok: true, hostname: "shop.myshop.co.in" })
  })
  it("connects www when only the bare domain is typed", () => {
    expect(parse("myshop.com")).toEqual({ ok: true, hostname: "www.myshop.com" })
    expect(parse("https://MyShop.co.in/")).toEqual({ ok: true, hostname: "www.myshop.co.in" })
    expect(isBareDomain("www.myshop.in")).toBe(false)
  })
  it("refuses our own names, reserved names, addresses and junk", () => {
    for (const v of ["", "myshop", "co.tany.in", "shop.tany.in", "app.tany.in", "tany.in", "x.tanystaging.in", "a.b.workers.dev", "shop.localhost", "shop.a.test", "192.168.1.4", "www.my_shop.com", "www.my shop.com", "user@www.myshop.com", "www.myshop.com:8080", "*.myshop.com"]) {
      expect(parse(v).ok, v).toBe(false)
    }
  })
  it("refuses whatever the root domain is configured to be, without its port", () => {
    expect(parseCustomHostname("anna.shops.example.org", "shops.example.org:3000").ok).toBe(false)
  })
})

describe("what the owner is asked to add", () => {
  it("splits the name a provider wants from the domain it is under", () => {
    expect(splitHostname("www.myshop.com")).toEqual({ name: "www", domain: "myshop.com" })
    expect(splitHostname("www.myshop.co.in")).toEqual({ name: "www", domain: "myshop.co.in" })
    expect(splitHostname("a.shop.myshop.in")).toEqual({ name: "a.shop", domain: "myshop.in" })
  })
  it("fits one record and the forwarding step into a message for whoever manages the domain", () => {
    const guide = { host: "www.myshop.com", domain: "myshop.com", name: "www", value: cnameValue("abc", "customers.tany.in"), forward: true }
    const text = setupInstructions(guide)
    expect(text).toContain("Value: abc.customers.tany.in")
    expect(text).toContain("forward myshop.com to https://www.myshop.com")
    expect(setupInstructions({ ...guide, forward: false })).not.toContain("forward")
  })
})

describe("which products are offered a domain", () => {
  it("is Motos only, in the menus too", async () => {
    const { offersCustomDomain } = await import("../lib/domains/rollout")
    const { ADMIN_NAV } = await import("../components/admin/nav-config")
    for (const [industry, nav] of Object.entries(ADMIN_NAV)) {
      const listed = nav.items.flatMap((i) => i.items ?? []).some((i) => i.url === "/settings/domain")
      expect(listed, industry).toBe(industry === "motors")
      expect(offersCustomDomain(industry as keyof typeof ADMIN_NAV), industry).toBe(industry === "motors")
    }
  })
})

describe("domain stages", () => {
  const at = new Date()
  it("follows the claim to the main address and back", () => {
    expect(domainStage({ verifiedAt: null, cfHostnameId: null, primaryAt: null })).toBe("pending_dns")
    expect(domainStage({ verifiedAt: null, cfHostnameId: "h", primaryAt: null })).toBe("securing")
    expect(domainStage({ verifiedAt: at, cfHostnameId: "h", primaryAt: null })).toBe("ready")
    expect(domainStage({ verifiedAt: at, cfHostnameId: "h", primaryAt: at })).toBe("live")
    expect(domainStage({ verifiedAt: null, cfHostnameId: "h", primaryAt: at })).toBe("interrupted")
  })
  it("switches on only with the certificate, and stays on through a renewal", () => {
    expect(shouldServe({ status: "active", sslStatus: "pending_validation" }, false)).toBe(false)
    expect(shouldServe({ status: "active", sslStatus: "active" }, false)).toBe(true)
    expect(shouldServe({ status: "active", sslStatus: "pending_validation" }, true)).toBe(true)
    expect(shouldServe({ status: "moved", sslStatus: "active" }, true)).toBe(false)
    expect(shouldServe(null, true)).toBe(false)
  })
})

describe("the proxy once a domain is the main address", () => {
  afterEach(() => vi.unstubAllEnvs())
  const call = async (url: string, method = "GET") => {
    vi.stubEnv("ROOT_DOMAIN", "tany.in")
    const { NextRequest } = await import("next/server")
    const { proxy } = await import("../proxy")
    return proxy(new NextRequest(url, { method, headers: { host: new URL(url).host } }))
  }
  it("sends pages on the default address there, keeping path and query, without a permanent redirect", async () => {
    const res = (await call("https://my-shop.tany.in/menu?utm_source=wa"))!
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://www.myshop.com/menu?utm_source=wa")
  })
  it("leaves API calls and form posts on the default address alone", async () => {
    for (const res of [await call("https://my-shop.tany.in/api/t/track"), await call("https://my-shop.tany.in/checkout", "POST")]) {
      expect(res!.headers.get("location")).toBeNull()
    }
  })
  it("serves the domain itself without redirecting, and leaves other businesses alone", async () => {
    const own = (await call("https://www.myshop.com/menu"))!
    expect(own.headers.get("location")).toBeNull()
    expect(own.headers.get("x-middleware-rewrite")).toContain("/sites/my-shop/menu")
    expect((await call("https://other.tany.in/menu"))!.headers.get("location")).toBeNull()
  })
})

describe("the address of a business's own domain", () => {
  afterEach(() => vi.unstubAllEnvs())
  it("is https in production, and http on the dev server's port locally", async () => {
    const { customDomainOrigin } = await import("../lib/env")
    vi.stubEnv("ROOT_DOMAIN", "tany.in")
    expect(customDomainOrigin("www.myshop.com")).toBe("https://www.myshop.com")
    vi.stubEnv("ROOT_DOMAIN", "localhost:3200")
    expect(customDomainOrigin("www.myshop.localtest.me")).toBe("http://www.myshop.localtest.me:3200")
  })
})

describe("live tracking origins", () => {
  it("admits our own hosts and the one hostname signed into the ticket", async () => {
    const { originAllowed } = await import("../workers/tracker/index")
    expect(originAllowed("https://my-shop.tany.in", "tany.in")).toBe(true)
    expect(originAllowed("https://www.myshop.com", "tany.in", "www.myshop.com")).toBe(true)
    expect(originAllowed("https://www.myshop.com", "tany.in")).toBe(false)
    expect(originAllowed("https://evil.com", "tany.in", "www.myshop.com")).toBe(false)
    expect(originAllowed(null, "tany.in", "www.myshop.com")).toBe(false)
  })
})
