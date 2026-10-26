import { expect, test } from "@playwright/test"

// A guest orders from a TanyEats storefront and pays at the counter (cash), end to end in a real browser against the real app and database.
// Needs the seed in e2e/restaurant-seed.sql. No payment provider is involved: online payment is NOT exercised here (that needs Razorpay
// test mode on a deployed staging, see docs/staging/staging-release-checklist.md).
const PORT = process.env.E2E_PORT ?? "3100"
const SHOP = `http://eats-e2e.localhost:${PORT}`

test("a guest browses the menu, orders for pickup, and sees their order; another business cannot open it", async ({ page, browser }) => {
  const providerRequests: string[] = []
  page.on("request", (r) => {
    if (/razorpay\.com/.test(r.url())) providerRequests.push(r.url())
  })
  await page.goto(`${SHOP}/menu`)
  // A first visit asks for the guest's location; a guest who does not want to share it skips.
  await page.getByRole("button", { name: "Skip for now" }).click({ timeout: 5_000 }).catch(() => {})
  await expect(page.getByRole("heading", { name: "Masala Dosa" })).toBeVisible()
  await expect(page.getByText("₹90").first()).toBeVisible()

  // Add the dish from its card on the menu, then look at the cart.
  const card = page.getByRole("heading", { name: "Masala Dosa" }).locator("xpath=ancestor::*[.//button[normalize-space()='Add']][1]")
  await card.getByRole("button", { name: "Add", exact: true }).click()
  await page.goto(`${SHOP}/cart`)
  await expect(page.getByText("Masala Dosa").first()).toBeVisible()

  await page.goto(`${SHOP}/checkout`)
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible()
  // The guest picks up and pays at the counter: the page defaults to delivery and online payment, so both are chosen explicitly.
  await page.getByRole("radio", { name: "Pickup" }).check()
  await page.getByRole("radio", { name: /cash/i }).check()
  // A missing name or a bad phone number is refused with a message, and nothing is created.
  await page.getByLabel("Your name").fill("Asha")
  await page.getByLabel("Mobile number").fill("12345")
  await page.getByRole("button", { name: /place order/i }).click()
  await expect(page.getByText("Enter a valid 10-digit mobile number.")).toBeVisible()
  await expect(page).toHaveURL(/\/checkout/) // still on checkout: no order was created

  await page.getByLabel("Mobile number").fill("9876500123")
  await page.getByRole("button", { name: /place order/i }).click()
  await page.waitForURL(/\/o\/[A-Z0-9]{6}/)
  expect(providerRequests, "a cash order never contacts the payment provider").toEqual([])
  const code = new URL(page.url()).pathname.split("/").pop()!
  await expect(page.getByText(code).first()).toBeVisible()
  await expect(page.getByText("Masala Dosa").first()).toBeVisible()

  // The order page belongs to that business: the same code on another business's host is not found.
  const other = await browser.newContext()
  const p2 = await other.newPage()
  const res = await p2.goto(`http://sri-murugan.localhost:${PORT}/o/${code}`)
  expect(res?.status()).toBe(404)
  await other.close()
})
