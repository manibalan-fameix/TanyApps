# TanyApps

Tany is the brand and TanyApps is the product suite. Each vertical is its own app on the same platform:
TanyCars (used-car dealers, this repo's `cars` module) and TanyEats (restaurants, the `restaurant` module)
are built. TanyMarts, TanyGifts, TanyMeds and more follow.

White-label used-car listing tool for independent dealers in Chennai. A dealer adds a car from
their phone in about two minutes and gets a public page under their own brand, a short share link,
an Instagram caption and a 4:5 photo set. It is a tool each dealer owns, not a marketplace.

Built with Next.js 16 (App Router), shadcn/ui (Base UI), Drizzle + Postgres, Auth.js, Cloudflare R2
and pg-boss. Read `DECISIONS.md` for the choices made along the way and what is still unverified.

## Local setup

Needs Node 24, pnpm and a Postgres database.

```bash
pnpm install
cp .env.example .env.local        # then fill in DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY at least
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # two demo dealers with different themes
pnpm db:import-variants           # the variants master table (45 models, ~450 rows)
pnpm dev
```

- Admin: `http://localhost:3000/login`. With no Google keys set, in development the sign-in button
  opens the seeded demo dealer without signing in (never active in production).
- Dealer sites: `http://sri-murugan.localhost:3000` and `http://chennai-prime.localhost:3000`
  (use Chrome; some browsers do not resolve `*.localhost`).
- No R2 keys, RC provider or vision key are needed in development: uploads go to `.local-uploads`,
  RC lookups use the mock provider, and plate reading falls back to typing the number.

### Video worker (optional)

Walkaround videos are converted to streaming HLS and checked for missing angles by a background
worker. It needs `ffmpeg` and `ffprobe` on the PATH.

```bash
pnpm worker
```

### Extending the variant data

Add rows to `data/variants/chennai-top40.csv` (or another file) and run
`pnpm db:import-variants [file.csv]`. Re-running updates existing rows in place. Extra columns named
`spec.<Group>.<Name>` and `features.<Group>` (values split on `|`) are stored as specs and features.

## Tests

```bash
pnpm typecheck && pnpm lint
pnpm test                                    # unit tests; the live-database tests skip unless a disposable test database is configured
pnpm test:db check                           # verify a configured test database is safe (changes nothing)
```

The live-database tests need a **disposable** migrated database: they insert rows, and price events
are append-only so they cannot be cleaned up. They refuse to run against anything that is not explicitly
marked disposable, uses a superuser or owner role, or looks like production. Setup, the safe commands and the
Neon driver checks are in [`docs/staging/neon-test-database.md`](docs/staging/neon-test-database.md); there is no way
to point them at a database by accident.

End-to-end tests (Playwright) run the add-a-car flow on an emulated Android phone, including an
emulated 3G run and an offline recovery. They need a migrated, seeded database:

```bash
pnpm exec playwright install chromium
DATABASE_URL=... ENCRYPTION_KEY=... pnpm test:e2e
```

They start their own dev server on port 3100 with a separate build directory, so they can run next
to a dev server you already have open.
