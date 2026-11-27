import { customDomainsConfigured } from "../../cloudflare/custom-hostnames"
import { sweepDomains } from "../../tenant/domains"
import type { Job } from "../scheduler"

/** Keeps businesses' own domains in step with Cloudflare. Safe to repeat: it only records what Cloudflare reports now. */
export const checkCustomDomainsJob: Job = {
  name: "check-custom-domains",
  async run() {
    if (!customDomainsConfigured()) return "custom domains are not configured"
    const r = await sweepDomains()
    return `${r.checked} domain(s) checked, ${r.changed} changed, ${r.failed} failed`
  },
}
