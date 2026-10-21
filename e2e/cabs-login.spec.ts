import { expect, test, type Page } from "@playwright/test"

const PORT = Number(process.env.E2E_LOGIN_PORT ?? 3102)
const SUB = `http://sri-murugan.localhost:${PORT}`
const CUSTOM = `http://cabs.example.test:${PORT}`
const EMU = "http://127.0.0.1:9099/emulator/v1/projects/demo-tany/verificationCodes"

async function latestCode(phone: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = ((await (await fetch(EMU)).json()) as { verificationCodes: { phoneNumber: string; code: string }[] }).verificationCodes
    const hit = list.filter((c) => c.phoneNumber === phone).at(-1)
    if (hit) return hit.code
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("no code in emulator")
}

/** Sends the browser from a business's site to the central login, enters the phone and code, and returns the ticket URL it was handed. */
async function signIn(page: Page, site: string, phone = "9876543210"): Promise<string> {
  await page.goto(`${site}/api/t/auth/start?next=/&lang=en`)
  await expect(page).toHaveURL(new RegExp(`^http://app\\.localhost:${PORT}/id\\?`))
  await page.locator("#login-phone").fill(phone)
  await page.getByRole("button", { name: "Send code" }).click()
  const code = await latestCode(`+91${phone}`)
  const callback = page.waitForRequest((r) => r.url().includes("/api/t/auth/callback"))
  await page.locator("#login-otp").fill(code)
  const url = (await callback).url()
  await page.waitForURL(`${site}/**`)
  return url
}

// Read through the browser (a fresh tab in the same cookie jar): Playwright's own HTTP client ignores the host mapping for the custom domain.
const session = async (page: Page, site: string) => {
  const tab = await page.context().newPage()
  await tab.goto(`${site}/api/t/auth/session`)
  const body = JSON.parse(await tab.innerText("body")) as { signedIn: boolean; customerId?: string }
  await tab.close()
  return body
}
/** POST to a site's logout from a page that sits on `from`, so the browser sets the real Origin. */
const logout = async (page: Page, from: string, to: string) => {
  const tab = await page.context().newPage()
  await tab.goto(`${from}/api/t/auth/session`)
  const status = await tab.evaluate(async (u) => (await fetch(u, { method: "POST" }).then((r) => r.status).catch(() => 0)), `${to}/api/t/auth/logout`)
  await tab.close()
  return status
}

for (const [name, site] of [["subdomain", SUB], ["custom domain", CUSTOM]] as const) {
  test(`phone login ends in a session on the ${name} only`, async ({ page, context }) => {
    const other = site === SUB ? CUSTOM : SUB
    expect((await session(page, site)).signedIn).toBe(false)
    await signIn(page, site)
    expect((await session(page, site)).signedIn).toBe(true)

    const cookies = await context.cookies()
    const mine = cookies.filter((c) => c.name === "tany_cs")
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/", domain: new URL(site).hostname })
    expect(await page.evaluate(() => document.cookie)).not.toContain("tany_cs")
    // The other business never receives it.
    expect((await session(page, other)).signedIn).toBe(false)

    // Logout needs the site's own Origin.
    // A page on another site cannot sign the customer out (the browser sets that page's own Origin; the response is blocked, the effect must not happen).
    await logout(page, other, site)
    expect((await session(page, site)).signedIn).toBe(true)
    expect(await logout(page, site, site)).toBe(200)
    expect((await session(page, site)).signedIn).toBe(false)
  })
}

test("a ticket works once, only on its own host, only in the browser that started the login", async ({ page, browser }) => {
  const url = await signIn(page, SUB, "9876543211")
  // Replay in the same browser.
  await page.goto(url)
  expect(page.url()).toContain("login=")
  expect((await session(page, SUB)).signedIn).toBe(true) // the first use stands; the replay changed nothing
  // Replay with the browser's state cookie put back: now only the single-use rule can stop it.
  const ticket = new URL(url).searchParams.get("ticket")!
  const st = JSON.parse(Buffer.from(ticket.split(".")[0], "base64url").toString()).st as string
  await page.context().addCookies([{ name: "tany_ls", value: st, url: SUB }])
  await page.goto(url)
  expect(page.url()).toContain("login=used")
  // The same ticket on another business's host.
  await page.goto(`${CUSTOM}/api/t/auth/callback?ticket=${encodeURIComponent(ticket)}`)
  expect(page.url()).toContain("login=wrong_")
  expect(page.url()).toContain("login=")
  expect((await session(page, CUSTOM)).signedIn).toBe(false)
  // A different browser (no state cookie), as in a link planted on a victim.
  const ctx2 = await browser.newContext()
  const p2 = await ctx2.newPage()
  const fresh = await signIn(page, SUB, "9876543212")
  await p2.goto(fresh)
  expect(p2.url()).toContain("login=wrong_state")
  expect((await session(p2, SUB)).signedIn).toBe(false)
  await ctx2.close()
})

test("the central login refuses hosts that are not a business", async ({ page }) => {
  for (const host of ["evil.example", `app.localhost:${PORT}`, "nobody.localhost:" + PORT]) {
    const res = await page.goto(`http://app.localhost:${PORT}/id?host=${encodeURIComponent(host)}&state=${"a".repeat(22)}&next=/`)
    expect(res?.status()).toBe(404)
  }
  const r = await page.request.post(`http://app.localhost:${PORT}/api/id/ticket`, { data: { idToken: "x".repeat(30), host: SUB.slice(7), state: "a".repeat(22) }, headers: { origin: "http://evil.example" } })
  expect(r.status()).toBe(403)
  const r2 = await page.request.post(`http://app.localhost:${PORT}/api/id/ticket`, { data: { idToken: "x".repeat(30), host: SUB.slice(7), state: "a".repeat(22) }, headers: { origin: `http://app.localhost:${PORT}` } })
  expect(r2.status()).toBe(401)
})
