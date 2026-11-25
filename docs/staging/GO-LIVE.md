# Staging go-live: from nothing to a live QA site

Audit date 13 Nov 2026. Companion to [`docs/tanycabs/STAGING.md`](../tanycabs/STAGING.md) (how each resource is created) and
[`staging-release-checklist.md`](staging-release-checklist.md) (the QA matrix). This file is the **order of work and the delivery flow**.

## How code reaches users

```
feature branch --PR--> staging  --(auto)-->  tanystaging.in   developers + QA test here
                          |
                          +--(QA signs off)--PR--> main --(manual, guarded)--> tany.in
```

- A push to `staging` runs `.github/workflows/ci.yml` (audit, typecheck, lint, build, tests on a throwaway Postgres, Worker bundle), then
  `.github/workflows/staging-deploy.yml`: upload secrets, apply migrations, wildcard DNS, deploy tracker + app + cron, smoke test.
- Production keeps its own guard (`pnpm run deploy production --confirm ... --migrations-applied`) and is deliberately **not** automated.
- Nothing reaches `main` that has not been on `staging`. Turn this into a rule with branch protection (below).

## Audit: what exists and what is missing

| Area | State on 13 Nov 2026 |
|---|---|
| Code for staging (`env.staging` in the 3 wrangler configs, deploy guard, secrets script, seed, smoke script, runbooks) | Present on `staging`/`main`. |
| Domain `tanystaging.in` | **Not live**: no nameservers resolve. Not yet bought, or not yet pointed at Cloudflare. |
| Cloudflare login on the dev machine | Signed in to account `81ea...` but the configs deploy to `8b98...2ede` (the account with `tany.in`). The guard blocks until the right account is used; CI uses a token for `8b98...` instead. |
| Neon staging database, R2 buckets, Razorpay test keys, `tany-staging` Firebase project, Maps key | **Not created** (`.env.staging` does not exist anywhere). |
| GitHub `staging` branch | Exists but is identical to `main` (`df4ec09`). No branch protection. |
| GitHub Environments / staging secrets | **None.** Repo secrets are only the Jarvis ones. |
| Deploy pipeline | **Was missing**; added here (`staging-deploy.yml`). |
| Crawlers | Staging is public and has no `noindex`. Add the header rule below. |
| Local checkout on `arch/hardening-pass` | 9 commits **behind** `main`, with 170+ uncommitted changes that duplicate work already on `main` (it has failing `tenant-access` test). Do not deploy from it; staging deploys come from GitHub only. |

## Owner steps, in order (about half a day, mostly waiting on DNS)

1. **Domain and Cloudflare zone**: [STAGING.md sections 1-2](../tanycabs/STAGING.md). The zone must be in the **same Cloudflare account as tany.in** (`8b98...2ede`) and show **Active**.
2. **Neon, R2, Razorpay (test), Firebase `tany-staging`, Maps**: STAGING.md sections 3-7. Then fill `.env.staging` (section 8) on your machine.
3. **One Cloudflare token for staging** (`CLOUDFLARE_API_TOKEN` in `.env.staging`, and the same value as the GitHub secret `CLOUDFLARE_DEPLOY_TOKEN`).
   **Why one:** wrangler loads `.env.staging` automatically when run with `--env staging` and uses that token in place of your login, so a DNS-only token
   fails every deploy with "Authentication error 10000". It also needs *Workers Scripts: Edit* at runtime, to attach business domains.
   Create it at My Profile, API Tokens, Create custom token: Account: *Workers Scripts: Edit*, *Account Settings: Read*; Zone (**only** `tanystaging.in`):
   *DNS: Edit*, *Workers Routes: Edit*, *Zone: Read*; User: *User Details: Read*. *Workers Scripts: Edit* is account-wide, so this token could also edit
   production Workers: keep it only in `.env.staging` and the GitHub `staging` environment.
4. **GitHub environment and secrets** (run from a clean clone, with your `.env.staging` file present):

   ```bash
   gh api -X PUT repos/manibalan-fameix/TanyApps/environments/staging
   gh secret set STAGING_ENV_FILE        --env staging < .env.staging
   gh secret set CLOUDFLARE_DEPLOY_TOKEN --env staging          # paste the token from step 3
   gh secret set CLOUDFLARE_ACCOUNT_ID   --env staging --body 8b98f4164cf5f4c0400f25a3f66b2ede
   ```

   **The repository is public**, so restrict the environment to the `staging` branch (Settings, Environments, staging, *Deployment branches*: selected branches,
   `staging`). Without that, a workflow on any other branch could read these secrets. Optionally add *Required reviewers* for a human click before each deploy.
5. **First deploy by hand once** (so the Workers, Durable Object migrations and certificates exist, and you can read errors on screen):
   `pnpm exec wrangler login` (account `8b98...`), then the commands in STAGING.md section 9, ending with `pnpm seed:staging`.
   From then on the pipeline does it: push or merge to `staging`.
6. **Razorpay webhook** (test mode) to `https://app.tanystaging.in/api/webhooks/razorpay`; Firebase authorised domain `app.tanystaging.in`; App Check enforcement after the first good login (STAGING.md sections 5-6).
7. **Keep search engines out.** Cloudflare, `tanystaging.in`, Rules, Transform Rules, *Modify Response Header*: set `X-Robots-Tag: noindex, nofollow` for all requests. No code change needed.
8. **Branch protection** (GitHub, Settings, Branches): on `staging` require a pull request and the `checks` and `worker-bundle` jobs; on `main` require a pull request and at least one reviewer, and make the release PR come from `staging` by convention (GitHub cannot enforce the source branch).

## QA access

- Share `https://app.tanystaging.in/login` (admin app), and the demo sites `https://demo-cabs.tanystaging.in`, `demo-eats`, `demo-motors`, plus `marina-spice` if you run `pnpm seed:tanyeats` (see [tanyeats-test-restaurant.md](tanyeats-test-restaurant.md)).
- Testers sign in with **Firebase test phone numbers** (STAGING.md step 6.8: no SMS, no cost) or Google. Send testers `staging-release-checklist.md` and the Razorpay test cards in the runbook.
- Staging is open to anyone who has the URL. If that is not acceptable, put the `app` host behind Cloudflare Access (free up to 50 users); business sites should stay public because they are what QA must exercise.

## Day to day

| Who | Does |
|---|---|
| Developer | Branch from `staging`, open a PR **into `staging`**, CI runs, merge: staging redeploys itself (a few minutes). A migration ships in the same PR; the pipeline applies it before the new code. |
| QA | Test on `tanystaging.in`, log defects against the commit shown in the Actions run. |
| Release | When QA signs off: PR `staging` into `main`, then the guarded production deploy from [`docs/release/PRODUCTION-RELEASE.md`](../release/PRODUCTION-RELEASE.md). |

## Rollback

Redeploy the previous commit (revert on `staging` and push), or Cloudflare dashboard, Workers, `tanyapps-staging`, Deployments, roll back. Migrations are additive: fix forward with a new migration, never edit an applied one.

## Known limits

- The first pipeline run cannot pass its smoke test until `pnpm seed:staging` has created `demo-motors`; seed once in step 5.
- The pipeline has not run yet: it needs the secrets above. The workflow YAML parses and reuses the repository's own checks, but a first real run may surface small account-permission issues (token scopes).
- Staging and production share one Cloudflare account, so a token that is too broad can reach both: keep the deploy token limited to the `tanystaging.in` zone as in step 3.

## As built (14 Nov 2026) and what went wrong on the way

- Firebase project id is **`tany-staging-qa`** (`tany-staging` was taken: ids are global). Web config comes from `.env.staging`; nothing in the repo names it.
- Created by hand once: R2 buckets and `cdn.tanystaging.in` (`wrangler r2 bucket domain add`), bucket CORS, Neon project `tany-staging` (ap-southeast-1, same region as production), reCAPTCHA Enterprise key, restricted Maps key, Razorpay test webhook.
- First deploy order that worked: `secrets:staging`, `db:migrate:staging`, `setup-wildcard-dns.sh staging`, `deploy:staging`, `deploy:cron`, `seed:staging`. Cloudflare answered "unknown error 10013" once when attaching the app's custom domains; attaching `app.` and the apex directly through the API worked, so retry before debugging.
- Webhook secret: generate it with `openssl rand -hex 24` and copy it with `grep ... | cut -d= -f2- | tr -d '\n' | pbcopy`; never type it. (One was once replaced by the webhook URL: the length looked right but anyone could have forged payment events.)
- `sed` replacements treat `&` as "the matched text": never use `sed` to write a Neon URL that contains `&channel_binding=require`. Write `?sslmode=require` with a script instead.
- Smoke check on `/api/upload` accepts 401 or 404 on a business host: the proxy deliberately skips that path and no cookie carries a Domain attribute, so a session can never reach it.
- Not verified by any run: a real card payment and refund (checklist rows 7-8), and the first pipeline run.
