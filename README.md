# Verdun

Verdun is the reusable core for database-backed collection/review workbenches. This repository carries the generic core plus a neutral bundled demo instance. Product apps extend Verdun through public package, API, database, deploy, and crawler contracts without moving domain behavior into this repository.

The first reusable boundary is now explicit:

- Verdun's `package.json` exports its app-facing JS/CSS surface as package subpaths (`@querygraph/verdun/frontend/*`, `@querygraph/verdun/api/public/*`, `@querygraph/verdun/db/public/*`, and `@querygraph/verdun/scripts/public/*`) so external apps do not import by filesystem-relative paths.
- `PUBLIC_SURFACE.md` is the source-of-truth list for external app imports; update it with `package.json` exports whenever Verdun promotes a new reusable JS/CSS/API/DB/script entrypoint.
- `EXTERNAL_APP.md` is the implementation guide for app packages that extend Verdun without moving domain behavior into the core repo.
- Generic workbench contracts live in `src/core/workbench.ts`.
- Generic frontend filtering/count/coverage logic lives in `src/composables/useWorkbenchView.ts`.
- Generic reusable Vue controls live under `src/components/workbench/`; external apps should consume them through `frontend/workbench-ui.ts`, shared workbench CSS through `frontend/workbench-style.css`, and the shared workbench view model/types through `frontend/workbench-view.ts`.
- Framework-neutral account interaction is exposed through `@querygraph/verdun/frontend/auth-ui` and `frontend/auth-style.css`. Verdun owns canonical `Sign up` / `Log in` intent and method state; apps inject their API adapters, continuation copy, optional provider mount, error mapping, and completion behavior.
- Generic compatibility-smoke loading is exposed through `scripts/public/test-loader.mjs`; external apps can reuse Verdun's TypeScript loader contract while supplying their own Vite, Vue, and icon-library resolution.
- Generic workbench API module discovery for compatibility smokes is exposed through `scripts/public/workbench-api-modules.mjs`, so external apps do not need to hardcode Verdun's internal workbench route filenames.
- Reusable account authentication is exposed through `@querygraph/verdun/accounts/*`: Google and LinkedIn verification, linked Google/LinkedIn/email identities, password-backed email accounts, one-time email link/code challenges, account sessions, and secure session cookies. The same public namespace now exposes application/family plan catalogs, manual and provider subscriptions, transition history, and transition confirmations. Transactional delivery remains available through `@querygraph/verdun/email`.
- Reusable Vercel project-domain operations are exposed through `@querygraph/verdun/domains/vercel`. Apps inject their token, immutable project ID, team slug, and fetch implementation; Verdun returns neutral DNS/status snapshots while environment lookup and user-facing error policy stay app-owned.
- External deploy-check profile modules can validate their app-owned metadata through `scripts/public/deploy-profile-contract.mjs` before opting into Verdun's public deployed-check entrypoint.
- The bundled default app is now a neutral `demo` instance at `/demo/`; it proves the reusable workbench frontend/API/deploy contract without making any product app core behavior.
- Generic database tables (`instances`, `records`, `source_runs`, `collection_plans`, `review_state`, `focuses`) and reusable `workbench_*` views live in `db/migrations/0003_generic_workbench_tables.sql`, exposed to external apps through `db/public/workbench-migrations.mjs`; app compatibility tables and views belong in external app packages.
- Generic crawler structs live internally in `crawler/src/core.rs` and are exposed to app crates only through `verdun_crawler::sdk`; crawler instances return `CrawlerCollection` with a core `CrawlerSnapshot`, while any legacy item/public JSON compatibility payloads stay instance-owned. The crawler SDK/runtime contract is documented in `crawler/README.md`. Verdun bundles only a neutral demo crawler proof; product apps run app-owned crawler crates.
- External Rust app crawlers should import the public SDK facade at `verdun_crawler::sdk`; it re-exports the stable instance registration, runtime, and generic snapshot contract without requiring consumers to import `core` or `instances` internals.
- Crawler instance modules export a neutral `CRAWLER_INSTANCE` registration; the shared Rust registry does not consume product-app static instance symbols.
- Bundled crawler instance modules are isolated behind `crawler/src/instances/bundled.rs`; Verdun's bundled crawler is the neutral demo proof while app crawlers register against the exported `verdun-crawler` runtime from their own crates.
- Crawler default item payload, source-run, public snapshot, config, and editorial-state paths are instance-owned metadata rather than shared `crawler/data/*` CLI defaults.
- Generic Vercel workbench surfaces live under `api/workbench/`; routes resolve their instance from explicit route/query metadata while the DB helper can read/write any supplied `WorkbenchInstance` namespace.
- Generic HTTP helpers and local workbench adapter contracts are exposed to external apps through `api/public/http.ts` and `api/public/workbench-local-adapter.ts`; instance-specific fallback adapters export neutral registration metadata from their own namespace.
- Vite base-path selection and `vercel.json` routing derive from registered deploy profiles; Verdun's default bundled profile is the neutral demo at `/demo/`.
- Instance deploy-check modules export neutral `deployCheckProfile` metadata, and the shared deployment registry discovers `scripts/instances/*/deploy-checks.mjs` profiles by convention.
- Product deploy-check profile metadata and hooks are app-owned; external apps opt into Verdun's generic deployed checker through the `scripts/public/check-deployed.mjs` entrypoint and `VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES`.
- Deployed draft/readiness checks are deploy-profile hooks. Verdun validates only generic route, snapshot, status, health, and declared profile mechanics.
- Product routes, scripts, publishing workflows, and compatibility database tables are app-owned surfaces, not Verdun core behavior.
- Verdun smoke scripts validate Verdun's own bundled demo core and reusable contracts; external app ownership checks belong in the app package.

The current core proof points are intentionally generic:

- Vue/Vite workbench shell deployed by Vercel.
- Vite base path and generated `vercel.json` routing driven by deploy-profile metadata.
- Vercel serverless API routes reading and writing an external Postgres database through generic workbench routes.
- Reusable Rust crawler/runtime crate that collects instance-owned records and exports SQL for the generic database shape.
- Public `verdun-cli` mothership crate and `verdun` binary. It persists token profiles under the user config directory, reports the existing workbench database/crawler health contract, and reports accounts with an optional tier so applications without plans remain first-class.
- Bundled demo crawler adapters for local records, local diagnostics, HTTP JSON, and HTTP status diagnostics, all preserving the same `CrawlerSnapshot` contract.
- Generic workbench item review, focus notes, source-run metadata, collection plans, and provenance stored in the reusable `workbench_*` views.
- Generic app and instance registries that discover bundled proof registrations by convention while external apps mount their own entrypoints.

Product-specific operations should be documented in product app packages. Verdun docs should describe reusable contracts and the bundled proof instance only.

## Vercel project domains

```ts
import { VercelProjectDomains } from '@querygraph/verdun/domains/vercel'

const domains = new VercelProjectDomains({
  token: process.env.VERCEL_API_TOKEN ?? '',
  projectId: process.env.VERCEL_PROJECT_ID ?? '',
  teamSlug: process.env.VERCEL_TEAM_SLUG ?? '',
  fetch,
})

const snapshot = await domains.attach('example.com')
const attachedDomains = await domains.list()
```

Use the returned `trafficRecords` and `verificationRecords`; do not hard-code Vercel DNS targets. `allowExisting` is intended only for an explicit administrator retry: even then, the client accepts an attach `400` only after an exact GET proves the domain belongs to the configured immutable project ID. A detach `404/not_found` is accepted only after a separate project lookup proves that the configured project and team scope still exist.

The ownership split is in place: external apps own frontend apps, domain API routes, crawler crates, deployment-check wrappers, publishing scripts, and compatibility SQL. Verdun's own default is the neutral demo. External apps consume Verdun's JS/CSS/API/DB/script public surface through package subpaths.

## Local app

```sh
npm install
npm run dev:app
```

Open `http://127.0.0.1:5176/demo/`.

Without `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`, the workbench API uses the bundled proof instance's static snapshot and reports read-only local persistence. External apps may provide their own local fallback adapters through `api/public/workbench-local-adapter.ts`.

Run `npm run vercel:config` in Verdun after changing bundled deploy profiles; it regenerates Verdun `vercel.json` routes for the bundled demo app path. External apps own their own Vercel config and may opt into Verdun's public deployment checker through `@querygraph/verdun/scripts/public/check-deployed`.

After deploying Verdun's bundled proof app, verify the route and data endpoints with:

```sh
npm run check:deployed
npm run check:deployed -- --require-database
```

`check:deployed` validates the deploy-profile base path, static snapshot, generic workbench records/status/health APIs, and profile-specific readiness hooks when present. Add `--require-database` after configuring external Postgres to prove the deployed API reports writable `database` persistence with enough loaded records, source runs, and query plans. For a local preview server started with `npm run prod:app`, use `npm run check:preview`; that runs the same route/static-snapshot checks without requiring Vercel API routes.

## Accounts and email authentication

External apps can combine `@querygraph/verdun/accounts/email-auth` with the existing account store, cookie helpers, Google credential verifier, and transactional email transport. Apply every path exported by `@querygraph/verdun/db/public/account-migrations`; `0.2.0` added linked-identity, authentication-challenge, and rate-limit state, while `0.3.0` adds application/family plans, subscriptions, provider events, and plan transitions.

Browser apps should mount the generic authentication flow from `@querygraph/verdun/frontend/auth-ui` and import its scoped `frontend/auth-style.css`. The component keeps `Sign up` and `Log in` visible, treats email-code login as existing-account-only, retains the entered email while clearing transient credentials, and delegates all network work to app-owned adapters. Apps supply only their continuation phrase (for example, “to contribute”), contextual note, provider mount, notices/error mapping, and authenticated continuation.

Email challenges support three purposes:

- `verify_email` registers an email/password identity after the user proves control of the address.
- `passwordless_login` logs an existing active account in without a password; it never creates an account.
- `password_reset` verifies the address, replaces the password, and revokes the account's earlier sessions.

`requestVerdunEmailChallenge` creates one challenge containing both a one-time link token and a six-digit code. Deliver it with `deliverVerdunEmailChallenge` and an `EmailSender` from `@querygraph/verdun/email`, then pass either proof to `completeVerdunEmailChallenge`; successful completion consumes the challenge and returns the account plus a new session token. Links put their secret in the URL fragment, so the app frontend must read the fragment and submit the proof to its app-owned completion route. Request endpoints should return the same public response when a challenge is suppressed, so account existence is not disclosed.

Identity linking happens only after provider verification. A verified Google or LinkedIn identity and a completed email challenge with the same normalized verified email resolve to one Verdun account and retain every login method. Verdun rejects a known provider subject that arrives with a different email and rejects attempts to bind one provider identity to two accounts. Apps must never call identity resolution using an unverified client-supplied email.

Every email-auth call that accepts `authPepper` must receive a stable server-only secret from `VERDUN_AUTH_PEPPER`; it must be at least 32 characters and must never use a `VITE_` prefix. Production delivery should fail closed instead of using the development log sender:

```sh
VERDUN_AUTH_PEPPER=<stable-random-secret-at-least-32-characters>
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=example-vercel@mail-host.example.net
SMTP_PASSWORD=<secret>
```

Each app supplies an approved default or purpose-specific From address through
`getEmailSender({ from })`. Build challenge links from the app's trusted
canonical HTTPS URL, not from an untrusted request host. See `A-SENDMAIL.md` for
the generalized Sendmail deployment and `EXTERNAL_APP.md` for the consumer flow
and ownership boundary.

Application-scoped plans are exported through `@querygraph/verdun/accounts/plan-types` and `@querygraph/verdun/accounts/plan-store`. Catalog records separate applications, plan families, plans, prices, and JSON entitlements; subscription records support manual assignment or trusted provider events with idempotent event IDs and stale-event ordering. Each change records a plan transition whose delivery state can be claimed and completed through `@querygraph/verdun/accounts/plan-email`.

The legacy `verdun_account.tier` field remains available for compatibility. New products should derive commercial access from the relevant application/family subscription and keep application authorization roles separate from paid-plan state. Run `npm run smoke:plans` for the focused contract smoke.

## Database

Apply migrations through the guarded helpers rather than applying every SQL file by directory. Reusable account and plan migrations are exposed through `db/public/account-migrations.mjs`. Verdun's reusable workbench contract lives in `db/migrations/0003_generic_workbench_tables.sql` and is exposed to external apps through `db/public/workbench-migrations.mjs`; product compatibility tables and view overlays belong in app-owned migrations selected by the app deploy profile.

See `DATABASE_RELOAD.md` for the external-crawler-to-Vercel/Neon runbook, including generic workbench reloads, app-specific loaders, redacted handoff artifacts, and verification commands.

Use the guarded deployment helper when moving a crawler snapshot into the external database:

```sh
npm run db:deploy
npm run db:deploy -- --apply
```

Without `--apply`, the helper regenerates `/tmp/verdun-workbench-load.sql` from the default deploy profile snapshot, validates it against the paired snapshot, and stops before touching Postgres. With `--apply`, it also verifies Vercel production has `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL` configured, applies the migration and SQL load through `psql`, and runs `npm run check:deployed -- --require-database` to prove the public API is backed by the external database. Use `--skip-vercel-env` or `--skip-deployed-check` only for local database drills.

## Crawler

The reusable crawler core lives under `crawler/src/`; crawler instances own domain adapters and return a core `CrawlerCollection`. Verdun exports the `verdun-crawler` SDK/runtime through `verdun_crawler::sdk` and bundles only the neutral demo proof instance. Product apps own their crawler configs, fixtures, Rust instance implementations, and binaries; each depends on the Verdun crawler crate with the matching crate version pinned and registers its own instance locally. Generic SQL export runs through the core `CrawlerSnapshot` shape instead of writing directly from app-specific payloads.

```sh
cargo run --manifest-path crawler/Cargo.toml -- collect --instance demo --generic-out /tmp/demo-snapshot.json
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot /tmp/demo-snapshot.json --out /tmp/verdun-load.sql --instance demo
npm run db:apply -- --sql /tmp/verdun-load.sql --snapshot /tmp/demo-snapshot.json
```

`collect` writes the selected bundled crawler instance's item payload, source-health rows, and public snapshot to instance-owned default paths unless `--out`, `--source-runs-out`, `--public-out`, or `--generic-out` are supplied. Verdun's bundled crawler proof is neutral demo-shaped; product collection should use app-owned crates documented in app package READMEs. Add `--generic-out path/to/snapshot.json` to always write the core `CrawlerSnapshot` beside any compatibility payload. `collect` and `queries` read the selected instance's default editorial state when it exists, so saved focus requests can add `focus_terms` to matching collection plans; use `--editorial-state path/to/state.json` to point at an exported editorial state file.
`export-sql --snapshot` loads a cohesive public or generic snapshot into SQL for external Postgres, keeping records, source-health rows, collection-plan rows, and the snapshot `generated_at` collection timestamp from the same crawler run. By default it emits the reusable Verdun contract load into `instances`, `records`, `source_runs`, and `collection_plans`. Instance-specific compatibility targets are plain target strings handled by the selected crawler instance, not Verdun core targets. The generic export defaults to the selected instance namespace and can be pointed at another namespace with `--instance`, `--instance-name`, and `--base-path`. The older `--input` plus `--source-runs` path remains available for debugging split files. `npm run db:apply` validates the SQL against the paired snapshot and stops as a dry run by default; pass `--apply` with `POSTGRES_URL`, `DATABASE_URL`, `NEON_DATABASE_URL`, or `--database-url` to apply sorted migrations and then the generated load through `psql`.
