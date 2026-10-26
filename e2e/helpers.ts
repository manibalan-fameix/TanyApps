import { expect, type Page } from "@playwright/test"

/** A real JPEG, generated in the page so no fixture file is needed. */
export async function jpeg(page: Page, label = "x") {
  const b64 = await page.evaluate(async (text) => {
    const c = document.createElement("canvas")
    c.width = 800
    c.height = 600
    const ctx = c.getContext("2d")!
    ctx.fillStyle = "#3b6ea5"
    ctx.fillRect(0, 0, 800, 600)
    ctx.fillStyle = "#fff"
    ctx.font = "48px sans-serif"
    ctx.fillText(text, 40, 300)
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9))
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ""
    buf.forEach((v) => (s += String.fromCharCode(v)))
    return btoa(s)
  }, label)
  return { name: `${label}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") }
}

/**
 * Signs in as the seeded demo dealer through the development-only demo button. The server shows that button only when
 * NODE_ENV is "development" and E2E=1 (see lib/auth/dev-bypass.ts); a production build never renders it.
 */
export async function signIn(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: /open the demo dealer/i }).click()
  await page.waitForURL("**/dashboard")
}

export async function startCar(page: Page, reg: string) {
  await page.goto("/cars/new")
  await page.getByTestId("start-new").click()
  await page.getByTestId("plate-file-input").setInputFiles(await jpeg(page, "plate"))
  await page.getByLabel("Registration number").fill(reg)
  await page.getByRole("button", { name: /look up this car/i }).click()
  await expect(page.getByTestId("variant-option").first()).toBeVisible()
}

/**
 * The wizard has an optional "Marketplace details" step between photos and price. These journeys do not fill it, so they pass
 * through it with Continue, exactly as a dealer who skips it would.
 */
export async function continuePastMarketplace(page: Page) {
  await expect(page.getByRole("heading", { name: "Marketplace details" })).toBeVisible()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
}

export async function pickVariantAndContinue(page: Page) {
  await page.getByTestId("variant-option").first().click()
  await expect(page.getByTestId("variant-option").first()).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Continue", exact: true }).click()
}

/** Width and height from a JPEG's start-of-frame marker. */
export function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error("Not a JPEG")
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + len
  }
  throw new Error("No SOF marker")
}
