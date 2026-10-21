import { describe, expect, it } from "vitest"

import { adminUrl, publicRootDomain, tenantUrl } from "../lib/env"
import { classifyHost, isValidSlug, normalizeHost } from "../lib/tenant/host"

const ROOT = "tany.in"

describe("classifyHost", () => {
  it("routes the root and www to marketing", () => {
    expect(classifyHost("tany.in", ROOT)).toEqual({ kind: "marketing" })
    expect(classifyHost("www.tany.in", ROOT)).toEqual({ kind: "marketing" })
  })
  it("routes app.<root> to admin", () => {
    expect(classifyHost("app.tany.in", ROOT)).toEqual({ kind: "admin" })
  })
  it("routes dealer subdomains", () => {
    expect(classifyHost("sri-motors.tany.in", ROOT)).toEqual({ kind: "subdomain", slug: "sri-motors" })
  })
  it("ignores ports, case and trailing dots", () => {
    expect(classifyHost("Sri-Motors.TANY.in:443", ROOT)).toEqual({ kind: "subdomain", slug: "sri-motors" })
    expect(classifyHost("app.tany.in.", ROOT)).toEqual({ kind: "admin" })
  })
  it("works on localhost with a port in ROOT_DOMAIN", () => {
    expect(classifyHost("demo.localhost:3000", "localhost:3000")).toEqual({ kind: "subdomain", slug: "demo" })
    expect(classifyHost("app.localhost:3000", "localhost:3000")).toEqual({ kind: "admin" })
    expect(classifyHost("localhost:3000", "localhost:3000")).toEqual({ kind: "marketing" })
  })
  it("rejects nested, reserved and malformed subdomains", () => {
    expect(classifyHost("a.b.tany.in", ROOT).kind).toBe("invalid")
    expect(classifyHost("api.tany.in", ROOT).kind).toBe("invalid")
    expect(classifyHost("-bad.tany.in", ROOT).kind).toBe("invalid")
    expect(classifyHost("under_score.tany.in", ROOT).kind).toBe("invalid")
  })
  it("does not treat lookalike domains as subdomains", () => {
    expect(classifyHost("eviltany.in", ROOT)).toEqual({ kind: "custom", hostname: "eviltany.in" })
    expect(classifyHost("tany.in.evil.com", ROOT)).toEqual({ kind: "custom", hostname: "tany.in.evil.com" })
  })
  it("sends unknown hosts to the custom-domain lookup", () => {
    expect(classifyHost("www.sridealer.com", ROOT)).toEqual({ kind: "custom", hostname: "www.sridealer.com" })
  })
  it("treats a missing host as invalid", () => {
    expect(classifyHost(null, ROOT).kind).toBe("invalid")
    expect(classifyHost("", ROOT).kind).toBe("invalid")
  })
})

describe("slugs", () => {
  it("validates", () => {
    expect(isValidSlug("sri-motors")).toBe(true)
    expect(isValidSlug("a")).toBe(true)
    expect(isValidSlug("app")).toBe(false)
    expect(isValidSlug("Has-Caps")).toBe(false)
    expect(isValidSlug("x".repeat(41))).toBe(false)
  })
  it("normalizeHost", () => {
    expect(normalizeHost(" Foo.com:8080 ")).toBe("foo.com")
  })
})

// Staging is a different ROOT_DOMAIN and nothing else: the same function, no special case. These are the production cases again with
// the staging root, plus the two ways a mix-up between the environments could hurt.
describe("classifyHost with the staging root (tanystaging.in)", () => {
  const STAGING = "tanystaging.in"
  it("behaves exactly like production for the same shapes of host", () => {
    const shape = (root: string) =>
      [`${root}`, `www.${root}`, `app.${root}`, `anna-travels.${root}`, `Anna-Travels.${root.toUpperCase()}:443`, `app.${root}.`, `a.b.${root}`, `api.${root}`, `-bad.${root}`].map((h) => classifyHost(h, root))
    expect(shape(STAGING)).toEqual(shape("tany.in"))
  })
  it("routes the four staging hosts", () => {
    expect(classifyHost("tanystaging.in", STAGING)).toEqual({ kind: "marketing" })
    expect(classifyHost("app.tanystaging.in", STAGING)).toEqual({ kind: "admin" })
    expect(classifyHost("demo-cabs.tanystaging.in", STAGING)).toEqual({ kind: "subdomain", slug: "demo-cabs" })
    // track.tanystaging.in is its own Worker, but if a request ever reached the app it would be treated as a business called "track",
    // which does not exist, so it ends in a 404 rather than anything useful.
    expect(classifyHost("track.tanystaging.in", STAGING)).toEqual({ kind: "subdomain", slug: "track" })
  })
  it("does not mistake a production host for a staging business, or the reverse", () => {
    expect(classifyHost("anna.tany.in", STAGING)).toEqual({ kind: "custom", hostname: "anna.tany.in" })
    expect(classifyHost("app.tany.in", STAGING)).toEqual({ kind: "custom", hostname: "app.tany.in" })
    expect(classifyHost("anna.tanystaging.in", "tany.in")).toEqual({ kind: "custom", hostname: "anna.tanystaging.in" })
    // A look-alike that merely ends with the staging name is not a tenant of it.
    expect(classifyHost("anna.nottanystaging.in", STAGING).kind).toBe("custom")
    expect(classifyHost("tanystaging.in.evil.com", STAGING).kind).toBe("custom")
  })
  it("builds business and admin addresses from the root, with https", () => {
    const prev = process.env.ROOT_DOMAIN
    process.env.ROOT_DOMAIN = STAGING
    try {
      expect(tenantUrl("demo-cabs", "/my")).toBe("https://demo-cabs.tanystaging.in/my")
      expect(adminUrl("/id")).toBe("https://app.tanystaging.in/id")
      expect(publicRootDomain()).toBe("tanystaging.in")
    } finally {
      if (prev === undefined) delete process.env.ROOT_DOMAIN
      else process.env.ROOT_DOMAIN = prev
    }
  })
  it("shows the product domain on a developer's machine", () => {
    const prev = process.env.ROOT_DOMAIN
    process.env.ROOT_DOMAIN = "localhost:3000"
    try {
      expect(publicRootDomain()).toBe("tany.in")
    } finally {
      if (prev === undefined) delete process.env.ROOT_DOMAIN
      else process.env.ROOT_DOMAIN = prev
    }
  })
})
