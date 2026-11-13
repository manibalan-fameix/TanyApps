# Git delivery plan

**Nothing here has been run against your repository.** The whole sequence was rehearsed in a scratch clone (your repository was only read). The rehearsal verified: every one of the 134 changed or new paths is in exactly one commit; the commits leave a tree byte-identical to your working tree; the hotfix branch contains exactly its 15 files and nothing else; the full branch rebases cleanly whether the hotfix is merged by fast-forward or **squash**; and nothing the full branch removed survives. It did **not** run the test suite on each intermediate commit: only the final state (and the hotfix on `main`) is tested, so review commit by commit for readability, not as independently shippable units.

## Read first: this repository is public

The weak super-admin guard has been readable on `main` since 2026-10-17. Do not push anything that explains it until production is secured.

- Ship the hotfix through a **private** route: a draft GitHub security advisory with a temporary private fork, or deploy from the local hotfix branch first.
- **Never push the `held-docs` commit** (`docs/architecture/`, `docs/release/`) or any branch containing it until the deployed environment is fixed (or confirmed never exposed). Step 5 makes a push-safe branch without it.
- Review `git diff` before every push. This plan never pushes.

## Why the hotfix is a patch, and the full branch sits on top of it

`docs/release/hotfix/super-admin-identity-fix.patch` is the frozen, independently tested P0 fix (15 files, sha256 starting `6325eca4`). Pass 5 later improved 7 of those 15 files, so the hotfix cannot be cut from the final files. It is applied from the patch onto `main`; the full branch is then built on top of that hotfix commit, so each later commit is a clean delta and the hotfix never depends on the rest.

## 0. Safety copy (changes nothing)

```
cd /Users/vishnu01/tany
git status                                         # branch arch/hardening-pass, HEAD == main
mkdir -p ~/tany-backup
git diff --binary > ~/tany-backup/tracked-changes.patch
git ls-files -o --exclude-standard | tar -czf ~/tany-backup/untracked-files.tgz -T -
git ls-files -m -o --exclude-standard | sort > ~/tany-backup/changed-paths.txt
wc -l ~/tany-backup/changed-paths.txt              # 134 paths: the plan below covers every one
```

## 1. The security hotfix branch, from `main` (in its own worktree: your working tree is not touched)

```
git worktree add ../tany-hotfix -b hotfix/identity-fix main
cd ../tany-hotfix
git apply /Users/vishnu01/tany/docs/release/hotfix/super-admin-identity-fix.patch
git add -A
git commit -m "fix(auth): derive super-admin access from the Firebase-verified identity"
git diff --stat main HEAD                          # exactly 15 files
pnpm install --frozen-lockfile && pnpm typecheck   # with your disposable test database set: pnpm test:db test
cd /Users/vishnu01/tany
```

Ship this branch first and alone (private route above). It is independent of everything below.

## 2. The full branch, on top of the hotfix (a second worktree: your dirty tree stays as it is)

```
git worktree add ../tany-full -b arch/hardening-pass-full hotfix/identity-fix
# copy the final version of every changed file into it
while IFS= read -r f; do mkdir -p "../tany-full/$(dirname "$f")"; cp "$f" "../tany-full/$f"; done < ~/tany-backup/changed-paths.txt
cd ../tany-full
# the hotfix added a test that the full branch replaces; remove it explicitly
git rm tests/team-security.integration.test.ts
```

Then the eight commits, in this order (deps, additive migrations, billing and jobs, identity, platform trail and usage, hardening, delivery, held docs):

```
# deps: 3 files
git add -- package.json \
    pnpm-lock.yaml \
    pnpm-workspace.yaml
git commit -m 'chore(deps): next 16.4.3, OpenNext 1.20.13, wrangler 4.152, zod 4.6.7; patched overrides; shadcn to devDependencies'

# schema: 17 files
git add -- drizzle/0033_team_invites.sql \
    drizzle/0034_security_audit_events.sql \
    drizzle/0035_usage_accounting.sql \
    drizzle/0036_trips_idempotency_key.sql \
    drizzle/meta/0033_snapshot.json \
    drizzle/meta/0034_snapshot.json \
    drizzle/meta/0035_snapshot.json \
    drizzle/meta/0036_snapshot.json \
    drizzle/meta/_journal.json \
    lib/db/schema/cabs.ts \
    lib/db/schema/dealers.ts \
    lib/db/schema/index.ts \
    lib/db/schema/platform.ts \
    lib/db/schema/usage.ts \
    lib/db/tenant-tables.ts \
    tests/migrations.test.ts \
    tests/tenant-leak.test.ts
git commit -m 'feat(db): additive migrations 0033-0036 (team invitations, security trail, usage accounting, booking operation key)'

# billing-jobs: 9 files
git add -- lib/billing/service.ts \
    lib/billing/state.ts \
    lib/core/jobs/reconcile-subscriptions.ts \
    lib/core/scheduler.ts \
    lib/tenant/billing.ts \
    tests/cron-status.integration.test.ts \
    tests/subscription-events.integration.test.ts \
    tests/subscription-reconcile.integration.test.ts \
    workers/cron/index.ts
git commit -m 'fix(billing): terminal subscription states, atomic paid-through, daily reconciliation job, job status view'

# identity: 23 files
git add -- .env.example \
    'app/(admin)/(shell)/settings/team/actions.ts' \
    'app/(admin)/(shell)/settings/team/page.tsx' \
    'app/(admin)/invite/[token]/actions.ts' \
    'app/(admin)/invite/[token]/page.tsx' \
    components/settings/team-actions.tsx \
    lib/auth/firebase-user.ts \
    lib/auth/firebase.ts \
    lib/auth/index.ts \
    lib/auth/session-claims.ts \
    lib/super/actions.ts \
    lib/super/data.ts \
    lib/super/emails.ts \
    lib/super/guard.ts \
    lib/tenant/create-dealer.ts \
    lib/tenant/invites.ts \
    lib/tenant/team.ts \
    scripts/upload-secrets.sh \
    tests/identity-ownership.test.ts \
    tests/super-admin-claims.test.ts \
    tests/super-admin-guard.test.ts \
    tests/super-sign-in-action.test.ts \
    tests/team-invites.integration.test.ts
git commit -m 'feat(identity): staff invitations with verified acceptance; owners no longer set credentials; verified-identity super admin'

# audit-usage: 22 files
git add -- 'app/(super)/super/export/[kind]/route.ts' \
    'app/(super)/super/payments/actions.ts' \
    'app/(super)/super/platform/page.tsx' \
    'app/(super)/super/security/page.tsx' \
    'app/(super)/super/usage/actions.ts' \
    'app/(super)/super/usage/page.tsx' \
    components/super/nav-config.ts \
    lib/cars/media.ts \
    lib/core/metrics.ts \
    lib/core/payment-exceptions.ts \
    lib/core/request-id.ts \
    lib/core/security-audit.ts \
    lib/core/usage.ts \
    lib/rc/lookup.ts \
    lib/super/queries.ts \
    lib/super/usage.ts \
    tests/cars.integration.test.ts \
    tests/payment-exceptions-admin.integration.test.ts \
    tests/security-audit.integration.test.ts \
    tests/usage-metering.integration.test.ts \
    tests/usage.test.ts \
    workers/video.ts
git commit -m 'feat(platform): security audit trail, usage metering and cost views for the Tany team'

# hardening: 24 files
git add -- 'app/(admin)/(shell)/cars/actions.ts' \
    app/api/cars/from-video/route.ts \
    app/api/t/chat/route.ts \
    app/api/t/csp-report/route.ts \
    app/api/t/track/route.ts \
    'app/api/upload/[...key]/route.ts' \
    components/cabs/book/booking-flow.tsx \
    lib/cabs/idempotency.ts \
    lib/cabs/public-actions.ts \
    lib/cabs/trips.ts \
    lib/core/client-ip.ts \
    lib/core/guards.ts \
    lib/media/photo-check.ts \
    lib/media/read-body.ts \
    lib/security/csp.ts \
    next.config.ts \
    tests/cabs/booking-idempotency.integration.test.ts \
    tests/csp.test.ts \
    tests/guards.test.ts \
    tests/jarvis-access.test.ts \
    tests/security-hardening.test.ts \
    workers/jarvis/access.mjs \
    workers/jarvis/index.mjs \
    workers/jarvis/wrangler.jsonc
git commit -m 'fix(security): trusted client IP, verified uploads and bounded bodies, headers and report-only CSP, Jarvis access checks, cab booking idempotency'

# delivery: 20 files
git add -- .github/workflows/ci.yml \
    .github/workflows/jarvis-ask.yml \
    .github/workflows/jarvis-digest.yml \
    docs/staging/staging-release-checklist.md \
    docs/tanycabs/STAGING.md \
    e2e/add-car.spec.ts \
    e2e/cabs-booking.spec.ts \
    e2e/cabs-operator.spec.ts \
    e2e/helpers.ts \
    e2e/restaurant-order.spec.ts \
    e2e/restaurant-seed.sql \
    e2e/subscription-ui.spec.ts \
    lib/deploy/guard.ts \
    playwright.config.ts \
    scripts/staging-smoke.sh \
    tests/architecture-boundaries.test.ts \
    tests/ci-workflow.test.ts \
    tests/deploy-guard.test.ts \
    tests/tenant-access.test.ts \
    tests/tenant-adversarial.integration.test.ts
git commit -m 'ci: workflow with pinned actions and gates; deploy-guard note; staging smoke script; repaired and extended e2e; architecture ratchets'

# held-docs: 16 files
git add -- docs/architecture/ARCHITECTURE_BASELINE.md \
    docs/architecture/ARCHITECTURE_DECISIONS.md \
    docs/architecture/ARCHITECTURE_TARGET.md \
    docs/architecture/AUDIT_COVERAGE_PASS2.md \
    docs/architecture/COST_GUARDRAILS.md \
    docs/architecture/DEPENDENCY_ADVISORIES.md \
    docs/architecture/IMPLEMENTATION_REPORT.md \
    docs/architecture/MIGRATION_AND_COMPATIBILITY.md \
    docs/architecture/PRODUCTION_READINESS.md \
    docs/architecture/RELEASE_REPORT.md \
    docs/architecture/RELIABILITY_AND_RECOVERY.md \
    docs/architecture/SECURITY_AND_TENANCY.md \
    docs/architecture/SECURITY_HOTFIX_PLAN.md \
    docs/release/GIT_DELIVERY.md \
    docs/release/hotfix/super-admin-identity-fix.patch \
    docs/release/operational-security.md
git commit -m 'docs: architecture, security and release reports (HOLD BACK: do not push until production is secured)'
```

Add the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` to the messages if you want attribution.

## 3. Verify nothing was lost or duplicated

```
git status --short                                  # empty
# every changed path equals the original working tree
while IFS= read -r f; do cmp -s "$f" "/Users/vishnu01/tany/$f" || echo "DIFFERS: $f"; done < ~/tany-backup/changed-paths.txt
git diff --name-only hotfix/identity-fix HEAD | sort | diff - <(sort ~/tany-backup/changed-paths.txt) | head
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint   # then the database suite with your disposable test DB
```

(The last `diff` lists only `tests/team-security.integration.test.ts`, the file step 2 removed on purpose.)

## 4. Merge sequencing

1. Hotfix to staging, verified, then production with your authorization (`SECURITY_HOTFIX_PLAN.md`).
2. Hotfix lands on `main`. **If merged normally (fast-forward or merge commit):** nothing else to do; the full branch is already on top of it. **If squash-merged** (a different commit with the same content), move the full branch over it:
   ```
   git fetch origin
   git rebase --onto origin/main hotfix/identity-fix arch/hardening-pass-full
   ```
   (rehearsed: no conflicts, identical final tree).
3. The full branch goes through review and passes GitHub CI before it merges. CI has never run: do not treat green local results as a CI pass.

## 5. Publishing the full branch without the held documents

```
cd /Users/vishnu01/tany-full 2>/dev/null || cd ../tany-full
git branch arch/hardening-pass-public HEAD~1        # HEAD~1 is the commit before held-docs
git push -u origin arch/hardening-pass-public       # only after the hotfix is live; never push arch/hardening-pass-full
gh pr create --base main --head arch/hardening-pass-public
```

Publish the held documents later, once the exposure question is settled, after deciding what to redact.

## 6. If a step goes wrong

`git worktree remove --force ../tany-hotfix ../tany-full` discards the scratch worktrees without touching your original tree; the backup in `~/tany-backup` and your untouched working tree are the recovery point. Before anything is pushed, commits are local and can be undone with `git reset --soft`. Nothing in this plan force-pushes.
