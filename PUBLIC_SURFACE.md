# Verdun Public Surface

Verdun's reusable app contract is intentionally smaller than its repository tree. External apps should import only the package subpaths and Rust SDK facade listed here. Other files are implementation detail unless they are promoted into this document and `package.json` exports together.

For the full app-package shape, see `EXTERNAL_APP.md`.

## JavaScript, TypeScript, and CSS Exports

These package subpaths are the supported external app surface:

- `@querygraph/verdun/frontend/workbench-ui`: shared Vue workbench controls.
- `@querygraph/verdun/frontend/workbench-view`: shared workbench filtering/count/coverage composable and TypeScript workbench types.
- `@querygraph/verdun/frontend/workbench-style.css`: shared workbench shell and component CSS.
- `@querygraph/verdun/accounts/account-types`: reusable account, tier, capability, and usage-window types for Verdun-backed apps.
- `@querygraph/verdun/accounts/email-auth`: email/password registration and sign-in, one-time link-or-code verification, passwordless sign-in, password reset, rate limiting, and verified-email identity linking.
- `@querygraph/verdun/accounts/google`: Google Identity Services credential verification for Google account bootstrap.
- `@querygraph/verdun/accounts/http`: Verdun account session cookie helpers and account-tier parsing.
- `@querygraph/verdun/accounts/plan-email`: application-owned plan-transition confirmation delivery through Verdun's transactional email transport, backed by claimable transition delivery state.
- `@querygraph/verdun/accounts/plan-store`: SQL-backed application and plan-family catalog operations, prices and billing customers, manual and provider subscriptions, ordered/idempotent provider events, effective-plan lookup, transition history, and transition-delivery claims.
- `@querygraph/verdun/accounts/plan-types`: reusable application, plan-family, plan, price, billing-customer, subscription, provider-event, transition, entitlement, and delivery-state types.
- `@querygraph/verdun/accounts/store`: SQL-backed account, linked-identity, session, usage, and bootstrap-admin store operations, plus the `VerdunAccountRow` SQL row type consumed by `verdunAccountFromRow`.
- `@querygraph/verdun/accounts/workspaces`: application-scoped workspace, membership, invitation, acceptance, and generic role persistence primitives. Apps define role meaning and feature authorization.
- `@querygraph/verdun/domains/vercel`: dependency-free Vercel project-domain client with explicit configuration/fetch injection, attach/refresh/detach operations, paginated project-domain listing, provider-neutral snapshots/DNS records, and typed errors. It always addresses projects by immutable ID, does not infer ownership from cross-project conflicts, and confirms the configured project before treating a detach `not_found` response as idempotent success.
- `@querygraph/verdun/api/public/http`: reusable Vercel-style request/response helpers. `sendJson`/`sendText` take an optional `{ cache: 'public' | 'private' | false }` option — the default keeps the shared-cache header (`s-maxage=15, stale-while-revalidate=60`), `'private'` sends `private, no-store` for authenticated responses, and `false` sets no cache-control header.
- `@querygraph/verdun/api/public/workbench-local-adapter`: local fallback adapter registration types.
- `@querygraph/verdun/email`: provider-agnostic transactional email transport (`EmailSender`, Resend adapter, log fallback, `getEmailSender`/`emailConfigured`/`emailFrom`/`maskEmailAddress`). App templates/recipients stay in the app. `getEmailSender()` throws when `EMAIL_PROVIDER=resend` is forced without `RESEND_API_KEY` (unforced auto-detection still falls back to the log sender); the log sender masks recipient addresses; Resend sends abort after 15 seconds.
- `@querygraph/verdun/svix`: dependency-free Svix webhook signature verification (e.g. for Resend webhooks), with replay protection via a timestamp tolerance window (default 300s; override with `verifySvixSignature(..., { toleranceSeconds })`).
- `@querygraph/verdun/db/public/account-migrations`: reusable Verdun account, linked-identity, email-auth, session, usage, application/plan-family catalog, subscription, provider-event, and plan-transition migration manifest.
- `@querygraph/verdun/db/public/workbench-migrations`: generic workbench migration manifest.
- `@querygraph/verdun/scripts/public/check-deployed`: deploy/readiness checker entrypoint for external app wrappers.
- `@querygraph/verdun/scripts/public/database-reload-handoff`: redacted database reload handoff writer plus shared cargo export and Node SQL apply command constructors for generic and app-specific loaders.
- `@querygraph/verdun/scripts/public/deploy-workbench-database`: generic workbench database deploy/preflight entrypoint with handoff artifact support.
- `@querygraph/verdun/scripts/public/deploy-profile-contract`: deploy-check profile validator for external app profile modules.
- `@querygraph/verdun/scripts/public/test-loader`: TypeScript compatibility-smoke loader contract.
- `@querygraph/verdun/scripts/public/workbench-apply-sql`: generic workbench SQL validation/apply entrypoint for external app wrappers.
- `@querygraph/verdun/scripts/public/workbench-api-modules`: generic workbench API module manifest for app compatibility smokes.
- `@querygraph/verdun/package.json`: package metadata for tools that need to locate the installed Verdun package root.

The implementation directories behind those exports are still Verdun-owned. Apps should not import `@querygraph/verdun/src/core/`, `@querygraph/verdun/api/core/`, `@querygraph/verdun/db/core/`, `@querygraph/verdun/scripts/core/`, or raw component files directly.

The legacy `verdun_account.tier` field remains part of the account compatibility contract for existing consumers. New commercial state should use application- and family-scoped plans and subscriptions instead, so one account can hold independent plans across products and plan families. Treat application authorization roles as app-owned state rather than inferring administrative authority from a paid plan.

## Rust Crawler SDK

External crawler crates should depend on `verdun-crawler` and import through:

- `verdun_crawler::sdk`

The SDK facade re-exports the stable crawler instance registration, runtime, source adapter, source-run reporting, artifact inventory, run-manifest, cache, HTTP fetch, and generic snapshot contracts. The crate's `core`, `instances`, and `runtime` modules are internal.

## Rust CLI

External Rust CLIs can depend on the public `verdun-cli` crate and import `verdun_cli`. It provides the neutral persisted-token profile format, config read/write helpers, bearer-authenticated JSON requests, and database/crawler/account report mapping. The `verdun` binary uses `/api/workbench/health` by default, which is the public health contract already implemented by the generic workbench. Product CLIs retain product-specific routes and commands; Suffix uses these persistence and authenticated-request primitives rather than duplicating them.

Consumers must declare an exact released dependency from crates.io (for example, `verdun-cli = "=0.1.0"`), not a sibling-path dependency. That fixed crate boundary means a Verdun regression cannot change an already-resolved Suffix build; upgrading Verdun is an explicit consumer change.

## Consumer Rule

External apps consume this surface as a package dependency. App behavior, routes, crawler instances, deploy profiles, publishing workflows, generated data, and compatibility SQL remain app-owned.
