import { expect, test, type Page } from "@playwright/test"


/** The first-time operator journey: set up the business, add a vehicle and its paperwork, set rates, and quote a fare. */

/** Development sign-in: opens the demo business (the one e2e/cabs-seed.sql made a cab operator). */
async function signIn(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: "Open the demo dealer" }).click()
  await page.waitForURL("**/dashboard")
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

async function field(page: Page, label: string | RegExp, value: string) {
  await page.getByLabel(label).first().fill(value)
}

test("a new cab operator sets up, adds a vehicle with documents, sets rates and gets a fare", async ({ page }) => {
  await signIn(page)

  // ----- the dashboard starts with a checklist, and nothing is priced yet -----
  await expect(page.getByRole("heading", { name: "Anna Travels" })).toBeVisible()
  await expect(page.getByText("5 steps left to set up")).toBeVisible()
  await expect(page.getByRole("link", { name: "Vehicles" }).first()).toBeVisible()

  // ----- a vehicle class -----
  await page.goto("/cabs/vehicle-classes")
  await page.getByRole("button", { name: "Add vehicle class" }).click()
  await field(page, "Class name", "Sedan")
  await page.getByRole("button", { name: "Add class", exact: true }).click()
  await expect(page.getByRole("cell", { name: "Sedan" })).toBeVisible()
  // The same name again is refused, on the field.
  await page.getByRole("button", { name: "Add vehicle class" }).click()
  await field(page, "Class name", "Sedan")
  await page.getByRole("button", { name: "Add class", exact: true }).click()
  await expect(page.getByText("You already have a class with that name.").first()).toBeVisible()
  await page.keyboard.press("Escape")

  // ----- a vehicle -----
  await page.goto("/cabs/vehicles")
  await page.getByRole("button", { name: "Add vehicle", exact: true }).click()
  await field(page, "Registration number", "tn 09 ab 1234")
  await field(page, "Make and model", "Toyota Etios")
  await page.getByRole("button", { name: "Add vehicle", exact: true }).last().click()
  await page.waitForURL(/\/cabs\/vehicles\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name: "Toyota Etios" })).toBeVisible()
  await expect(page.getByText("TN 09 AB 1234").first()).toBeVisible()

  // ----- documents: expired, expiring soon, valid -----
  const addDoc = async (type: string, till: string) => {
    await page.getByRole("button", { name: "Add document" }).click()
    await page.getByLabel("Document", { exact: true }).click()
    await page.getByRole("option", { name: type }).click()
    await page.getByLabel("Valid till").fill(till)
    await page.getByRole("button", { name: "Save document" }).click()
    await expect(page.getByRole("button", { name: "Save document" })).toBeHidden()
  }
  await addDoc("Insurance", inDays(-3))
  await addDoc("Permit", inDays(10))
  await addDoc("Fitness certificate", inDays(200))
  const rows = page.getByRole("row")
  await expect(rows.filter({ hasText: "Insurance" }).getByText("Expired")).toBeVisible()
  await expect(rows.filter({ hasText: "Permit" }).getByText("Expires soon")).toBeVisible()
  await expect(rows.filter({ hasText: "Fitness certificate" }).getByText("Valid")).toBeVisible()

  // ----- a scan: a real PDF is stored and served back; a disguised web page is refused -----
  await page.getByRole("button", { name: "Add document" }).click()
  await page.getByLabel("Choose a document file").setInputFiles({ name: "rc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF") })
  await expect(page.getByText("rc.pdf")).toBeVisible()
  await page.getByLabel("Document", { exact: true }).click()
  await page.getByRole("option", { name: "RC" }).click()
  await page.getByRole("button", { name: "Save document" }).click()
  const view = page.getByRole("row").filter({ hasText: "RC" }).getByRole("link", { name: "View" })
  await expect(view).toBeVisible()
  const served = await page.request.get((await view.getAttribute("href"))!)
  expect(served.status()).toBe(200)
  expect(served.headers()["content-type"]).toBe("application/pdf")
  expect(served.headers()["x-content-type-options"]).toBe("nosniff")
  expect(served.headers()["cache-control"]).toContain("no-store")

  await page.getByRole("button", { name: "Add document" }).click()
  await page.getByLabel("Choose a document file").setInputFiles({ name: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") })
  await expect(page.getByText(/does not look like a PDF/i)).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).first().click()

  // The vehicle list summarises the paperwork.
  await page.goto("/cabs/vehicles")
  await expect(page.getByText("1 expired")).toBeVisible()
  await expect(page.getByText("1 expiring soon")).toBeVisible()

  // ----- a driver -----
  await page.goto("/cabs/drivers")
  await page.getByRole("button", { name: "Add driver" }).click()
  await field(page, "Name", "Murugan")
  await field(page, "Mobile number", "98765 43211")
  await page.getByRole("button", { name: "Add driver", exact: true }).last().click()
  await page.waitForURL(/\/cabs\/drivers\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name: "Murugan" })).toBeVisible()

  // ----- no fare can be quoted until the owner has decided the rates and GST -----
  await page.goto("/cabs/pricing")
  await expect(page.getByText("No rate cards yet")).toBeVisible()
  await page.getByLabel("Pickup (India time)").fill("2026-11-02T10:00")
  await page.getByLabel("Distance (km)").fill("18.4")
  await expect(page.getByText(/No active rate card/)).toBeVisible()

  await page.getByRole("button", { name: "Add rate card" }).first().click()
  await field(page, "Base fare (₹) (optional)", "200")
  await field(page, "Rate per km (₹)", "14")
  await page.getByRole("button", { name: "Add rate card", exact: true }).last().click()
  await expect(page.getByRole("cell", { name: "Airport transfer" })).toBeVisible()
  await expect(page.getByText("Set your GST rate first")).toBeVisible()

  await page.goto("/cabs/settings")
  await field(page, /GST on fares/, "5")
  await page.getByLabel("Your state").click()
  await page.getByRole("option", { name: /Tamil Nadu/ }).click()
  await page.getByRole("button", { name: "Save settings" }).click()
  await expect(page.getByText("Settings saved.")).toBeVisible()

  // ----- the real engine prices it: 200 + 18.4 km at 14 = 457.60, +5% GST = 480.48, shown as a whole ₹480 -----
  await page.goto("/cabs/pricing")
  await page.getByLabel("Pickup (India time)").fill("2026-11-02T10:00")
  await page.getByLabel("Distance (km)").fill("18.4")
  await expect(page.getByTestId("fare-total")).toHaveText("₹480")
  await expect(page.getByTestId("notice-tolls_parking_extra")).toHaveText("Tolls & parking extra, as actual")
  await expect(page.getByText("CGST 2.5%")).toBeVisible()
  await expect(page.getByText("SGST 2.5%")).toBeVisible()

  // ----- the dashboard now shows the progress and the paperwork warnings -----
  await page.goto("/dashboard")
  await expect(page.getByText("You are set up")).toBeVisible()
  await expect(page.getByText(/document.* expired/)).toBeVisible()
})

test("a cab operator's public site shows the vehicles and no prices", async ({ page }) => {
  await page.goto("http://sri-murugan.localhost:" + (process.env.E2E_CABS_PORT ?? "3101") + "/")
  await expect(page.getByRole("heading", { name: "Anna Travels" })).toBeVisible()
  await expect(page.getByText("Online booking is coming soon")).toBeVisible()
  await expect(page.getByText("Sedan")).toBeVisible()
  await expect(page.getByText("₹")).toHaveCount(0)
})
