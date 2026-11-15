# Dependency advisories

`pnpm audit` (full tree, 2026-10-26). **Before pass 2: 41 advisories (3 critical, 13 high, 18 moderate, 7 low). After: 2 (1 high, 1 moderate), none in the deployed runtime.**

Correction to pass 1: `ARCHITECTURE_BASELINE.md` F8 said the critical `next` advisories came from a nested copy inside OpenNext. That was wrong. They were on the app's **own direct dependency `next` 16.3.4**.

## What was upgraded (direct dependencies, all within the same major)

| Package | From → To | Why |
|---|---|---|
| `next` | 16.3.4 → 16.4.3 | Fixes GHSA-2464-fhr4-w9xw (critical, RCE in the Image Optimization API), GHSA-673q-mjm6-r5xr (critical, RCE in `use cache`), GHSA-vcvr-r3jv-pc5j (critical, RCE in `next/og`), GHSA-p3m5-59mp-jv5r (high, Server Actions DoS), GHSA-cjq9-62q9-8jv4 (high, SSRF in image optimization) and 8 moderate/low cache/disclosure advisories. |
| `@opennextjs/cloudflare` | 1.20.6 → 1.20.13 | Its peer range for `next` is `>=16.4.1`, so it had to move with `next`. |
| `wrangler` | 4.136.3 → 4.152.0 | Required by OpenNext 1.20.13 (`^4.148.0`); carries a patched `miniflare`/`undici`. |
| `zod` | 4.6.5 → 4.6.7 | GHSA-mrhx-c7xc-m3w5 (high, memory exhaustion on oversized collections). The app validates untrusted input with zod, so this one is runtime-relevant. |
| `vitest` | 5.0.1 → 5.0.5 | `@vitest/mocker` advisories (dev only). |

Reachability of the `next` criticals in TanyApps: the app does not use `use cache`, `next/og` or `ImageResponse`; it uses `next/image` in one onboarding component. On Cloudflare, OpenNext serves `/_next/image` through its own handler, so the stock optimizer was probably not the serving path. Treat that as reasoning, not proof: the upgrade removes the question.

## Transitive overrides (`pnpm-workspace.yaml`)

Same-major patched versions forced for packages that exist only in build/dev tooling: `vite` ^8.3.5, `source-map-js` ^1.2.2, `undici@7` ^7.30.1, `body-parser` ^2.4.0, `fast-uri` ^3.1.9, `hono` ^4.13.14, `ip-address` ^10.7.5, `@modelcontextprotocol/sdk` ^1.32.0, `@grpc/grpc-js` ^1.13.6, `glob@10` ^10.5.0.

| Advisory family | Chain | In deployed Worker? |
|---|---|---|
| MCP SDK, body-parser, hono, fast-uri, ip-address, undici (shadcn side) | `shadcn` CLI → `@modelcontextprotocol/sdk` → express/hono | No. `shadcn` is only imported as `shadcn/tailwind.css` at build. |
| undici (miniflare), body-parser (express) | `@opennextjs/cloudflare` → `wrangler` / `@opennextjs/aws` | No. Local dev server and build tooling. |
| vite, `@vitest/mocker` | `vitest` | No. Tests only. |
| source-map-js | `next`/Tailwind postcss | Build time. |
| `@grpc/grpc-js` | `firebase` → `@firebase/firestore` | No. The app imports no Firestore code (`grep` for `firebase/firestore`: none); it uses Auth only. |
| glob command injection (`-c/--cmd`) | `@opennextjs/aws` → `@node-minify/core` | No. Build tool; the vulnerable path is the glob CLI flag. |

Overrides are a maintenance debt. Re-check them after each `next`/OpenNext/`shadcn` upgrade and delete any that the dependency now satisfies itself.

## Still open (2)

| Advisory | Package | Chain | Class | Why not fixed | Mitigation |
|---|---|---|---|---|---|
| GHSA-67mh-4wv8-2f99 (moderate) | `esbuild` 0.18.20 | `drizzle-kit` → `@esbuild-kit/esm-loader` | dev only | Fix needs 0.25+, a jump across breaking 0.x minors inside a loader that pins `~0.18`. The flaw is in esbuild's *dev server*, which `drizzle-kit migrate` never starts. | Do not run `esbuild --serve` in this project. Revisit when `drizzle-kit` drops `@esbuild-kit`. |
| GHSA-mrhx-c7xc-m3w5 (high) | `zod` 3.25.76 | `shadcn` → `zod-to-json-schema` | dev only | The `shadcn` CLI pins zod 3; a major override could break it. | Not reachable from app code (the app's own `zod` is 4.6.7). `shadcn` runs only when someone adds a component. |

## Verified after the upgrade

Typecheck, lint, full disposable-database suite, `next build`, `opennextjs-cloudflare build`, `wrangler deploy --dry-run` for app/tracker/cron. See IMPLEMENTATION_REPORT.md. **Not verified:** runtime behaviour on a deployed Worker (NOT RUN; needs staging).
