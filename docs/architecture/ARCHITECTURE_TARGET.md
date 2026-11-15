# Target architecture

Decision: **stay a modular monolith.** Nothing measured in this pass justifies splitting services. The existing extra Workers (tracker, cron, jarvis) are already split for real runtime reasons (Durable Objects, scheduled triggers) and stay as they are.

## Layers and allowed dependencies

```
app/ (routes, server actions)  ─▶  lib/<product>/  ─▶  lib/core/  ─▶  lib/db, lib/storage, lib/auth
                                   lib/cars | restaurant | cabs        (shared platform)
components/<product>/ ─▶ components/ui, hooks, lib/<same product>, lib/core
```

Rules:
1. A product (`cars`, `restaurant`, `cabs`) never imports another product. Shared code moves to `lib/core` (logic) or `components/ui` / a shared components folder (UI).
2. `lib/core` should not import a product. Scheduled jobs are the one place it does today (they have to call product services); keep them thin and listed.
3. Tenant data is reached only through `scopedDb` / `scopedTransaction`. The raw client is for global tables (users, dealers, variants), lookups by provider id (webhooks), and platform sweeps, and lives in `lib/**`, never `app/`/`components/`.
4. Money state changes are single conditional statements or one short transaction; provider calls happen after commit with a stable idempotency key.

Rules 1 and 2 are enforced by `tests/architecture-boundaries.test.ts` as a ratchet (existing violations allowlisted, new ones fail).

## Adding a new product (e.g. TanyRetail)

Add `lib/retail/`, `components/retail/`, register its tables in `lib/db/tenant-tables.ts` (the leak test then demands a scoped-update proof), add its vertical in `lib/verticals`, and a payment `kind` in `lib/core/payments`. Reuse `lib/core/{guards,permissions,rate-limit,audit,payments,scheduler,usage}`. Nothing in cars/restaurant/cabs changes.

## Remaining structural work (not done)

- Move `DataGrid`, `ImageUpload`, `PageHeader`, `google-map`, `optionsFilter`/`gridTheme` and `restaurant/images` to shared locations, then delete their 11 lines from `KNOWN_EDGES`. Mechanical, wide diff; do it as its own PR.
- Invert `lib/core/geo → cabs/states` (pass the status list in) and give jobs a registry that products contribute to.
