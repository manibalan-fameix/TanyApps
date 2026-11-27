# Custom domains

A Pro business can serve its shop on a domain it owns (for example `www.sellershypermarket.com`) instead of `sellershypermarket.tany.in`.
**Motos only for now** (`lib/domains/rollout.ts`): other products do not see the page. The feature is **off** until `CUSTOM_DOMAIN_TARGET` is set, so the code can ship before Cloudflare is ready.

## What the owner does (Settings → Custom domain)

1. Types their domain. `theirshop.com` becomes `www.theirshop.com` (shown before they add it): most DNS providers cannot point a bare domain at another service.
2. Adds **one record** at their provider: a CNAME named `www` with the value shown, `<their token>.customers.tany.in`. The screen has GoDaddy steps, general steps, and buttons to copy or WhatsApp the instructions or ask Tany for help. They forward the bare domain to `www`.
3. Waits. The open page checks every 30 seconds and the scheduled job every five minutes (for seven days), so they may leave and come back.
4. When it shows **Ready**, presses **Make main address** and confirms. `<slug>.tany.in` pages now redirect to the domain.

If a provider hides CNAME records from lookups, the screen offers a TXT record at `_tany-verify` as a second proof.

The default address takes over again, with no action needed, if the domain stops pointing here or the plan no longer includes it. The redirect is temporary (307) for that reason.
Changes reach every server within about a minute. The `check-custom-domains` job runs every five minutes, 20 domains per run, longest unchecked first.

## Cloudflare setup (do it on staging first)

Uses Cloudflare for SaaS on the zone (`tanystaging.in`, then `tany.in`). Check current pricing and limits on Cloudflare's plans page before enabling it.

1. Zone → SSL/TLS → Custom Hostnames: enable Cloudflare for SaaS.
2. DNS: add `customers` **and** `*.customers` as **proxied** `AAAA 100::` records (each business's CNAME points at its own name under `customers`). Set `customers.<root>` as the **fallback origin** and wait for it to be Active.
3. Workers routes: sellers' traffic needs the route `*/*` on the app Worker. **This route matches every proxied host in the zone**, so first protect the others. A more specific route wins:

   | Host | Route to add before `*/*` |
   |---|---|
   | `cdn.<root>/*` (R2 pictures) | Worker: **None** |
   | `track.<root>/*` (live tracking) | the tracker Worker |
   | `tany.in/*`, `www.tany.in/*` | already routed to `tany-website`; leave as they are |
   | any other proxied host in the zone | its own Worker, or None |

   Then add `{ "pattern": "*/*", "zone_name": "<root>" }` to that environment's `routes` in `wrangler.jsonc`; a route added only in the dashboard should not be relied on to survive deploys.
   After deploying, open the website, a business subdomain, `app.`, a picture on `cdn.` and live tracking before going on.
4. API token: create one with only **Zone → SSL and Certificates → Edit**, limited to this zone, and set it as `CUSTOM_DOMAIN_API_TOKEN`. Do not reuse a broader token: the app holds it.
5. Apply migration `0050_custom_domains`, then set `CUSTOM_DOMAIN_TARGET=customers.<root>` (`pnpm secrets:staging` uploads it). `CLOUDFLARE_ZONE_ID` must be this zone.
6. Deploy the app, the tracker (it now admits a seller's domain for live tracking) and the cron worker (new job).

References: [Workers as your fallback origin](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin), [plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/).

## Check with a real domain before offering it to sellers

The automated tests fake Cloudflare and DNS. On staging, with a real spare domain, check:

- **first of all:** that a CNAME to `<token>.customers.<root>` (one record, no TXT) gets a certificate and loads the shop over HTTPS. This has only been tested with Cloudflare faked;
- for Motos: car pages, shared car links, the enquiry form, and a booking with a test payment (Razorpay may require the seller's domain to be registered on the account taking the payment);
- before offering it to other products: customer sign-in, adding to cart, checkout and a test payment;
- maps: a Google Maps browser key restricted by website must also allow the seller's domain, or maps will not load there;
- live delivery tracking;
- breaking the CNAME: within a few minutes of Cloudflare noticing, `<slug>.<root>` stops redirecting. How quickly Cloudflare notices is not under our control, and until then visitors are still redirected. The owner can press **Use <slug>.<root> instead** at once.
