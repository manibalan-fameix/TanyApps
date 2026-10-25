# Disposable test database (local Postgres or Neon staging)

The live-database tests insert fixtures, run jobs that sweep every tenant, and probe database triggers. They must only ever run against a
database that may be wiped. This is enforced in code, not by care: `tests/support/disposable-db.ts` runs before any live test starts.

## What the guard requires (all of it, every time)

| # | Check | How you satisfy it |
|---|---|---|
| 1 | Explicit opt-in | `TEST_DATABASE_DISPOSABLE=1` and `TEST_DATABASE_CONFIRM=<the database name>` typed out |
| 2 | Dedicated identity | database **and** role names contain `test`, `qa`, `ci`, `scratch` or `disposable` as a whole word; the role is not `postgres`, `neondb_owner` or another owner role; the database carries the comment `tany:disposable-test-db` (only its owner can add it) |
| 3 | Restricted credentials | the role is **not** a superuser (checked on the server) |
| 4 | No known production | host is `localhost`/`127.0.0.1`/`::1` or `*.neon.tech`; not a host in `TANY_PRODUCTION_DB_HOSTS`; not the same host and database as `DATABASE_URL`; no `prod`/`production`/`live` in the host, database or role; `NODE_ENV` is not `production` |

`.env.local` is never read. `pnpm test` with no `TEST_DATABASE_URL` skips every live test, as before. An unsafe setting does **not** skip: it
fails the run loudly. No test file reads `TEST_DATABASE_URL` itself (`tests/test-db-guard.test.ts` fails if one does).

## One-time setup: a SEPARATE Neon project

Do **not** use a branch of production: a branch copies every row, including customers' phone numbers and addresses.

1. Neon console: create a **new project** (for example `tany-staging`; see `docs/tanycabs/STAGING.md` step 3). Choose the region deliberately
   **[verify current region list and India data-residency needs in Neon's docs]**. A free or low plan is enough **[verify current plan limits]**.
2. A *branch of that empty staging project* is fine for a throwaway run (it contains no customer data). Name it for the run, delete it after.
3. In the Neon SQL editor, as the project owner, run the output of `pnpm test:db setup-sql` (choose a long random password; keep it out of git):
   ```sql
   CREATE ROLE tany_test_user LOGIN PASSWORD '<choose-a-long-random-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
   CREATE DATABASE tany_test OWNER tany_test_user;
   COMMENT ON DATABASE tany_test IS 'tany:disposable-test-db';
   ```
   If Neon's console refuses to create the role in SQL, create it in the console (*Roles & Databases*), then run the other two statements
   **[verify]**. The role must end up non-superuser and own `tany_test`.
4. Copy two connection strings for role `tany_test_user`, database `tany_test`: the **pooled** one (host contains `-pooler`) for the app and tests,
   and the **direct** one for migrations.

## Environment (explicit, never from a file the repo loads)

Type the secret at a hidden prompt so it stays out of shell history:

```bash
read -rs "PW?tany_test_user password: "; echo
export TEST_DATABASE_URL="postgres://tany_test_user:${PW}@<ep-xxxx-pooler>.<region>.aws.neon.tech/tany_test?sslmode=require"
export TEST_DATABASE_MIGRATE_URL="postgres://tany_test_user:${PW}@<ep-xxxx>.<region>.aws.neon.tech/tany_test?sslmode=require"   # direct host
export TEST_DATABASE_DISPOSABLE=1
export TEST_DATABASE_CONFIRM=tany_test
export TANY_PRODUCTION_DB_HOSTS="<production-host-1>,<production-host-2>"   # strongly recommended: a second wall against a typo
unset PW
```

## Commands

```bash
pnpm test:db check        # every safety check, changes nothing. Run this first.
pnpm test:db migrate      # applies migrations (0029, 0030, ...) using the DIRECT url if TEST_DATABASE_MIGRATE_URL is set
pnpm test:db neon-check   # driver checks (below)
pnpm test:db test         # the whole suite; add vitest args to narrow it, e.g. pnpm test:db test tests/motors-booking-payment.integration.test.ts --testTimeout=30000
```

These never print a password (only `user@host:port/database`). `drizzle-kit` auto-loads a `.env` file from the working directory when
`DATABASE_URL` is unset, but not `.env.local`; `test:db migrate` always sets `DATABASE_URL` explicitly, which wins over any `.env`.

## Neon HTTP / WebSocket driver checks

Production on Cloudflare Workers uses the Neon driver (`lib/db/client.ts`): plain queries go over **HTTP**, and every transaction opens a
short-lived **WebSocket** connection. A local database uses node-postgres instead, so a green local run says nothing about that path.

`pnpm test:db neon-check` prints which path it exercised (it says plainly when it was *not* Neon) and checks, using temporary tables only:

1. a plain query (HTTP);
2. a transaction opening and committing (WebSocket), with the median time. This is the figure to compare when evaluating a pooler or Hyperdrive;
3. an error inside a transaction rolls everything back and surfaces to the caller;
4. a unique violation arrives with SQLSTATE `23505` where `isUniqueViolation` looks for it (`e.code` or `e.cause.code`). If this fails on Neon,
   the payment code's retry branches would silently misbehave;
5. a second transaction really waits for the first (real server transactions, not statements).

Things to watch on the first Neon run of the full suite:

- **Cold start.** A suspended compute can take seconds to wake. Run `check` first to wake it, and pass `--testTimeout=30000`.
- **Parallel WebSockets.** Tests that fire many events at once open many WebSocket transactions; watch for connection-limit errors on the pooler.
- **Node needs a global `WebSocket`** for the transaction path (Node 22+ has it; this repo runs Node 24).

## Troubleshooting (found on the first real Neon run)

- **node-postgres hangs, then `timeout expired`, while `psql` connects fine.** Node 24 races IPv4 against IPv6 when it connects; on a network
  whose IPv6 route is unreachable the connection never completes. Set `NODE_OPTIONS="--no-network-family-autoselection --no-warnings"` for the
  run (or connect to the IPv4 address). This affects only your machine: Cloudflare Workers use the Neon HTTP/WebSocket driver, not this path.
- **Everything is slow.** Opening a transaction costs one WebSocket plus TLS plus authentication. From India to `aws-us-east-2` it measured about
  2 s (median of 5). Use `--testTimeout=120000 --hookTimeout=120000`. The staging region should match production's, or latency figures
  will not predict production.
- **The default branch of every Neon project is named `production`.** In the staging project that is just Neon's default name; the guard never
  looks at branch names, only at host, database, role and the marker.

## What is cleaned up, and what is not

Tests now remove only the rows they created (by the ids or dealer they own). Two things are global by design and are only safe here because of
the guard: `cron.integration.test.ts` runs the real `expire-unpaid-orders` job over every restaurant in the database, and audit/price-event rows
are append-only and cannot be cleaned up. Drop the Neon branch (or the database) after a run.
