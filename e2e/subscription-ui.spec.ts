import { expect, test } from "@playwright/test"

import { signIn } from "./helpers"

// The billing page in a local environment with NO payment provider configured. This proves the page's honest "payments are off" state, the
// way back to the dashboard, and that looking at billing contacts no provider. It does NOT test choosing a plan or paying: the plan picker is
// only rendered when Razorpay is configured, so that journey is BLOCKED here and belongs to Razorpay TEST mode on a deployed staging
// (docs/staging/razorpay-test-mode-runbook.md, matrix rows 7 and 8 in docs/staging/staging-release-checklist.md).
test("with payments switched off the billing page says so, offers no way to pay, and contacts no payment provider", async ({ page }) => {
  const providerRequests: string[] = []
  page.on("request", (r) => {
    if (/razorpay\.com/.test(r.url())) providerRequests.push(r.url())
  })
  await signIn(page)
  await page.goto("/settings/billing")
  await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible()
  await expect(page.getByText("Payments are turned off in the local demo account.")).toBeVisible()
  // Nothing on the page can start a payment or a plan change.
  await expect(page.getByRole("radiogroup", { name: "Plan" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /subscribe|pay|upgrade|choose plan|start/i })).toHaveCount(0)
  expect(providerRequests, "viewing billing does not contact the payment provider").toEqual([])
  // The owner can leave: the rest of the dashboard still works.
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/dashboard/)
})
