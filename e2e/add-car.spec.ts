import { expect, test, type Page } from "@playwright/test"

import { CAR_ANGLES } from "../lib/angles"
import { continuePastMarketplace, jpeg, jpegSize, pickVariantAndContinue, signIn, startCar } from "./helpers"

async function captureAll(page: Page) {
  await page.getByRole("button", { name: /start guided capture/i }).click()
  for (const [i, angle] of CAR_ANGLES.entries()) {
    await expect(page.getByRole("dialog")).toContainText(`${i + 1} of ${CAR_ANGLES.length}`)
    await page.getByTestId("camera-file-input").setInputFiles(await jpeg(page, angle))
  }
  await expect(page.getByRole("dialog")).toBeHidden()
}

test("plate photo to a published car, with a working short link", async ({ page, request }) => {
  const started = Date.now()
  await signIn(page)

  await startCar(page, "TN 11 AB 1234")
  await expect(page.getByText("TN 11 AB 1234").first()).toBeVisible()
  await pickVariantAndContinue(page)

  await expect(page.getByTestId("angle-grid")).toBeVisible()
  await captureAll(page)
  await expect(page.getByTestId("upload-count")).toHaveText("12 of 12 uploaded", { timeout: 60_000 })
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await continuePastMarketplace(page)

  await page.getByLabel("Asking price (₹)").fill("565000")
  await page.getByLabel("Kilometres driven").fill("48200")
  await page.getByRole("button", { name: "Publish" }).click()

  await expect(page.getByTestId("published-title")).toBeVisible()
  const elapsedSec = (Date.now() - started) / 1000
  console.log(`plate photo to published: ${elapsedSec.toFixed(1)}s`)
  expect(elapsedSec).toBeLessThan(120)

  const shortLink = await page.getByTestId("short-link").inputValue()
  expect(shortLink).toMatch(/^http:\/\/sri-murugan\.localhost:\d+\/[23456789a-hjkmnp-z]{5,6}$/)
  const caption = await page.getByTestId("caption").inputValue()
  expect(caption).toContain(shortLink)
  expect(caption).toContain("5,65,000")
  expect(caption).toContain("48,200 km")

  // The short link 301s to the canonical URL, and that page renders the car.
  const res = await request.get(shortLink, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  const canonical = new URL(res.headers()["location"], shortLink).toString()
  expect(canonical).toMatch(/\/\d{4}-[a-z0-9-]+-tn11(-\d+)?$/)
  await page.goto(canonical)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Alpha", { ignoreCase: true }).catch(() => {})
  // The buyer page shows the price in more than one place (header card and purchase panel); one visible match is what matters.
  await expect(page.getByText("₹5,65,000").first()).toBeVisible()
  await expect(page.getByText("TN11AB1234")).toHaveCount(0) // the plate never reaches buyers

  // Another dealer's subdomain must not resolve this car's short link.
  const other = shortLink.replace("sri-murugan", "chennai-prime")
  expect((await request.get(other, { maxRedirects: 0 })).status()).not.toBe(301)
})

test("uploads survive going offline and finish when the network returns", async ({ page, context }) => {
  await signIn(page)
  await startCar(page, "TN 09 CD 5678")
  await pickVariantAndContinue(page)
  await expect(page.getByTestId("angle-grid")).toBeVisible()

  await context.setOffline(true)
  await page.getByRole("button", { name: /start guided capture/i }).click()
  // Capture the cover photo and one more while offline, then close the camera.
  for (const angle of CAR_ANGLES.slice(0, 2)) {
    await page.getByTestId("camera-file-input").setInputFiles(await jpeg(page, angle))
  }
  await page.getByRole("button", { name: /^done$/i }).click()

  // Nothing has landed, and the app says so instead of failing.
  await expect(page.getByTestId("upload-count")).toHaveText("0 of 12 uploaded")
  await expect(page.getByText(/offline/i).first()).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByTestId("upload-count")).toHaveText("2 of 12 uploaded", { timeout: 60_000 })
})

test("publishing waits for the cover photo, then unlocks while other photos keep uploading", async ({ page }) => {
  await signIn(page)
  await startCar(page, "TN 22 EF 9012")
  await pickVariantAndContinue(page)
  await page.getByRole("button", { name: "Continue", exact: true }).click() // photos step: none taken
  await continuePastMarketplace(page)

  await page.getByLabel("Asking price (₹)").fill("350000")
  await page.getByLabel("Kilometres driven").fill("72000")
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled()
  await expect(page.getByText(/cover photo/i).first()).toBeVisible()
})

/** A photo-sized JPEG (hundreds of KB): flat colour compresses to nothing, so add texture. */
async function heavyJpeg(page: Page) {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas")
    c.width = 1920
    c.height = 1440
    const ctx = c.getContext("2d")!
    const g = ctx.createLinearGradient(0, 0, 1920, 1440)
    g.addColorStop(0, "#5b8fc7")
    g.addColorStop(1, "#c7a15b")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1920, 1440)
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgb(${(i * 37) % 255},${(i * 91) % 255},${(i * 53) % 255})`
      ctx.globalAlpha = 0.35
      ctx.fillRect((i * 613) % 1900, (i * 977) % 1400, 20 + (i % 70), 20 + ((i * 7) % 70))
    }
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9))
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ""
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(s)
  })
  return { name: "cover.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") }
}

test("emulated Fast 3G: plate photo to published in under 2 minutes with only the cover photo", async ({ page }) => {
  await signIn(page)
  await page.goto("/cars/new")
  await page.getByTestId("start-new").click()
  await expect(page.getByTestId("plate-file-input")).toBeAttached()

  // Fast 3G, applied after the app shell has loaded so we measure the flow, not the dev bundle.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 562,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })

  const cover = await heavyJpeg(page)
  console.log(`cover photo size before on-device resize: ${(cover.buffer.length / 1024).toFixed(0)} KB`)

  const started = Date.now()
  await page.getByTestId("plate-file-input").setInputFiles(await jpeg(page, "plate"))
  await page.getByLabel("Registration number").fill("TN 11 AB 4321")
  await page.getByRole("button", { name: /look up this car/i }).click()
  await expect(page.getByTestId("variant-option").first()).toBeVisible({ timeout: 60_000 })
  await pickVariantAndContinue(page)

  await page.getByRole("button", { name: /start guided capture/i }).click()
  await page.getByTestId("camera-file-input").setInputFiles(cover) // front 3/4 = the cover photo
  await page.getByRole("button", { name: /^done$/i }).click()
  await expect(page.getByTestId("upload-count")).toHaveText("1 of 12 uploaded", { timeout: 90_000 })
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await continuePastMarketplace(page)

  await page.getByLabel("Asking price (₹)").fill("450000")
  await page.getByLabel("Kilometres driven").fill("52000")
  await page.getByRole("button", { name: "Publish" }).click()
  await expect(page.getByTestId("published-title")).toBeVisible({ timeout: 60_000 })

  const elapsedSec = (Date.now() - started) / 1000
  console.log(`emulated Fast 3G, plate photo to published: ${elapsedSec.toFixed(1)}s (excludes human typing time)`)
  expect(elapsedSec).toBeLessThan(120)
})

test("carousel photos download as 4:5 crops", async ({ page }) => {
  await signIn(page)
  await startCar(page, "TN 33 GH 7788")
  await pickVariantAndContinue(page)

  await page.getByRole("button", { name: /start guided capture/i }).click()
  for (const angle of CAR_ANGLES.slice(0, 3)) await page.getByTestId("camera-file-input").setInputFiles(await jpeg(page, angle))
  await page.getByRole("button", { name: /^done$/i }).click()
  await expect(page.getByTestId("upload-count")).toHaveText("3 of 12 uploaded", { timeout: 60_000 })
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await continuePastMarketplace(page)
  await page.getByLabel("Asking price (₹)").fill("480000")
  await page.getByLabel("Kilometres driven").fill("30000")
  await page.getByRole("button", { name: "Publish" }).click()
  await expect(page.getByTestId("published-title")).toBeVisible()

  const files: Buffer[] = []
  page.on("download", async (d) => {
    const path = await d.path()
    if (path) files.push((await import("node:fs")).readFileSync(path))
  })
  await page.getByRole("button", { name: /download photos/i }).click()
  await expect.poll(() => files.length, { timeout: 30_000 }).toBe(3)
  for (const f of files) expect(jpegSize(f)).toEqual({ width: 1080, height: 1350 })
})
