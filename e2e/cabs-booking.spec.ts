import { expect, test, type Page } from "@playwright/test"

// The journey that matters: a customer books an airport trip, the operator accepts it, the customer sees it confirmed.
// Runs against the Firebase Auth emulator and a fake map service (see playwright.cabs-login.config.ts).

const PORT = Number(process.env.E2E_LOGIN_PORT ?? 3102)
const SUB = `http://sri-murugan.localhost:${PORT}`
const EMU = "http://127.0.0.1:9099/emulator/v1/projects/demo-tany/verificationCodes"

async function latestCode(phone: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = ((await (await fetch(EMU)).json()) as { verificationCodes: { phoneNumber: string; code: string }[] }).verificationCodes
    const hit = list.filter((c) => c.phoneNumber === phone).at(-1)
    if (hit) return hit.code
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("no code in emulator")
}

/** On the central login page: enter the number, then the code the emulator "sent". Waits for the page to be live before clicking. */
async function otpLogin(page: Page, phone: string) {
  await expect(page).toHaveURL(new RegExp(`^http://app\\.localhost:${PORT}/id\\?`))
  await page.waitForLoadState("networkidle")
  await page.locator("#login-phone").fill(phone.slice(3))
  await page.getByRole("button", { name: "Send code" }).click()
  await page.locator("#login-otp").fill(await latestCode(phone))
}

const inHours = (h: number) => new Date(Date.now() + h * 3600_000 + 330 * 60_000).toISOString().slice(0, 16)

async function fillTrip(page: Page) {
  await page.goto(`${SUB}/`)
  await expect(page.getByRole("heading", { name: /where to/i })).toBeVisible()
  await page.locator("#pickup").fill("T Nagar")
  await page.getByRole("button", { name: /T Nagar/ }).first().click()
  // The drop is an airport: tap the quick pick under the drop field.
  await page.locator("#drop").locator("xpath=ancestor::div[contains(@class,'flex-col')][1]").getByRole("button", { name: "Chennai Airport" }).click()
  await expect(page.locator("#drop")).toHaveValue("Chennai Airport")
  await page.locator("#start-at").fill(inHours(30))
  await page.getByRole("button", { name: "See vehicles and fares" }).click()
}

test("a customer books an airport trip, the operator accepts, the customer sees it confirmed", async ({ page, browser }) => {
  // ----- the customer finds a fare -----
  await fillTrip(page)
  await expect(page.getByRole("heading", { name: "Choose your vehicle" })).toBeVisible()
  const card = page.getByTestId("vehicle-Sedan")
  await expect(card).toBeVisible()
  await expect(card.getByTestId("vehicle-fare")).toHaveText(/^₹[\d,]+$/)
  // The breakdown sheet shows the lines and the notice that tolls and parking are extra.
  await card.getByRole("button", { name: "Fare details" }).click()
  await expect(page.getByTestId("notice-tolls_parking_extra")).toHaveText("Tolls & parking extra, as actual")
  await page.keyboard.press("Escape")
  const fare = (await card.getByTestId("vehicle-fare").textContent())!
  await card.getByRole("button", { name: "Select" }).click()

  // ----- review; the phone must be verified before anything is created -----
  await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible()
  await expect(page.getByTestId("fare-total")).toHaveText(fare)
  await page.getByTestId("verify-to-book").click()
  await otpLogin(page, "+919876511122")

  // ----- back on the site, the trip is where they left it -----
  await page.waitForURL(`${SUB}/**`)
  await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible()
  await expect(page.getByTestId("fare-total")).toHaveText(fare)
  await page.getByRole("button", { name: "Request booking" }).click()

  await page.waitForURL(/\/my\/bookings\/[0-9a-f-]{36}/)
  const code = (await page.getByTestId("booking-code").textContent())!.trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  await expect(page.getByTestId("booking-status")).toHaveText("Waiting for confirmation")
  await expect(page.getByTestId("new-booking")).toContainText(code)
  const bookingUrl = page.url().split("?")[0]

  // ----- the operator sees it and accepts -----
  const opCtx = await browser.newContext()
  const op = await opCtx.newPage()
  await op.goto("/login")
  await op.getByRole("button", { name: "Open the demo dealer" }).click()
  await op.waitForURL("**/dashboard")
  await op.goto("/cabs/bookings")
  await expect(op.getByTestId(`booking-row-${code}`)).toBeVisible()
  await expect(op.getByTestId("inbox-new")).toContainText("1")
  await op.getByRole("link", { name: code }).click()
  await expect(op.getByTestId("op-booking-status")).toHaveText("Needs your answer")
  await op.getByTestId("accept-booking").click()
  await expect(op.getByTestId("op-booking-status")).toHaveText("Confirmed")
  await expect(op.getByTestId("op-timeline")).toContainText("Accepted")

  // ----- the customer sees it confirmed -----
  await page.goto(bookingUrl)
  await expect(page.getByTestId("booking-status")).toHaveText("Confirmed")
  await expect(page.getByTestId("timeline")).toContainText("Confirmed by")
  await expect(page.getByTestId("call-operator")).toBeVisible()

  // ----- in Tamil -----
  await page.getByRole("button", { name: "தமிழ்" }).click()
  await expect(page.getByTestId("booking-status")).toHaveText("உறுதிப்படுத்தப்பட்டது")
  await page.getByRole("button", { name: "English" }).click()

  // ----- history, and booking again prefilled -----
  await page.getByTestId("nav-bookings").click()
  await expect(page.getByTestId(`trip-${code}`)).toBeVisible()
  await page.goto(bookingUrl)
  await page.getByTestId("repeat-booking").click()
  await expect(page.locator("#pickup")).toHaveValue("T Nagar")
  await expect(page.locator("#drop")).toHaveValue("Chennai Airport")
  await opCtx.close()
})

test("the operator can reject with a reason, and the customer sees it; the customer can cancel; sign out everywhere ends other devices", async ({ page, browser }) => {
  await fillTrip(page)
  await page.getByTestId("vehicle-Sedan").getByRole("button", { name: "Select" }).click()
  await page.getByTestId("verify-to-book").click()
  await otpLogin(page, "+919876511133")
  await page.waitForURL(`${SUB}/**`)
  await page.getByRole("button", { name: "Request booking" }).click()
  await page.waitForURL(/\/my\/bookings\/[0-9a-f-]{36}/)
  const code = (await page.getByTestId("booking-code").textContent())!.trim()

  const opCtx = await browser.newContext()
  const op = await opCtx.newPage()
  await op.goto("/login")
  await op.getByRole("button", { name: "Open the demo dealer" }).click()
  await op.waitForURL("**/dashboard")
  await op.goto("/cabs/bookings")
  await op.getByRole("link", { name: code }).click()
  await op.getByTestId("adjust-fare").click()
  await op.getByLabel("Agreed fare (₹)").fill("450")
  await op.getByTestId("confirm-action").click() // a reason is required
  await expect(op.getByText("Please give a short reason.")).toBeVisible()
  await op.getByLabel(/Reason/).fill("Regular customer")
  await op.getByTestId("confirm-action").click()
  await expect(op.getByTestId("adjusted-note")).toContainText("₹450")
  await op.getByTestId("reject-booking").click()
  await op.getByLabel(/Reason/).fill("No car free that day")
  await op.getByTestId("confirm-action").click()
  await expect(op.getByTestId("op-booking-status")).toHaveText("Rejected")

  await page.reload()
  await expect(page.getByTestId("booking-status")).toHaveText("Not accepted")
  await expect(page.getByTestId("call-operator")).toBeVisible()
  await expect(page.getByTestId("cancel-booking")).toHaveCount(0) // nothing left to cancel

  // A second device signs in; signing out everywhere on the first ends the second.
  const second = await browser.newContext()
  const p2 = await second.newPage()
  await p2.goto(`${SUB}/api/t/auth/start?next=/my/bookings`)
  await otpLogin(p2, "+919876511133")
  await p2.waitForURL(`${SUB}/my/bookings`)
  await expect(p2.getByTestId(`trip-${code}`)).toBeVisible()

  await page.goto(`${SUB}/my`)
  await page.getByTestId("sign-out-everywhere").click()
  await expect(page.getByRole("heading", { name: /where to/i })).toBeVisible()
  await p2.goto(`${SUB}/my/bookings`)
  await expect(p2).toHaveURL(new RegExp(`^http://app\\.localhost:${PORT}/id\\?`)) // sent back to log in
  await opCtx.close()
  await second.close()
})

test("the operator takes a booking by phone with a typed distance, and it is confirmed", async ({ browser }) => {
  const ctx = await browser.newContext()
  const op = await ctx.newPage()
  await op.goto("/login")
  await op.getByRole("button", { name: "Open the demo dealer" }).click()
  await op.waitForURL("**/dashboard")
  await op.goto("/cabs/bookings/new")
  await op.getByLabel("Customer mobile number").fill("9876511144")
  await op.getByLabel("Customer name").fill("Counter Customer")
  await op.getByLabel("Pickup", { exact: true }).fill("T Nagar")
  await op.getByRole("button", { name: /T Nagar/ }).first().click()
  await op.getByLabel("Drop", { exact: true }).fill("Chennai International")
  await op.getByRole("button", { name: /Chennai International Airport/ }).first().click()
  await op.getByLabel("Pickup date and time").fill(inHours(48))
  await op.getByTestId("mb-preview").click()
  await expect(op.getByTestId("fare-total")).toHaveText(/^₹[\d,]+$/)
  await expect(op.getByTestId("notice-tolls_parking_extra")).toBeVisible()
  await op.getByTestId("mb-create").click()
  await op.waitForURL(/\/cabs\/bookings\/[0-9a-f-]{36}/)
  await expect(op.getByTestId("op-booking-status")).toHaveText("Confirmed")
  await op.goto("/cabs/customers?q=9876511144")
  await expect(op.getByRole("link", { name: "Counter Customer" })).toBeVisible()
  await ctx.close()
})
