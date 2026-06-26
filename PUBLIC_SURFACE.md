# Verdun Public Surface

Verdun's reusable app contract is intentionally smaller than its repository tree. External apps should import only the package subpaths and Rust SDK facade listed here. Other files are implementation detail unless they are promoted into this document and `package.json` exports together.

For the full app-package shape, see `EXTERNAL_APP.md`.

## JavaScript, TypeScript, and CSS Exports

These package subpaths are the supported external app surface:

- `@querygraph/verdun/frontend/workbench-ui`: shared Vue workbench controls.
- `@querygraph/verdun/frontend/workbench-view`: shared workbench filtering/count/coverage composable and TypeScript workbench types.
- `@querygraph/verdun/frontend/workbench-style.css`: shared workbench shell and component CSS.
- `@querygraph/verdun/accounts/account-types`: reusable account, tier, capability, and usage-window types for Verdun-backed apps.
- `@querygraph/verdun/accounts/google`: Google Identity Services credential verification for Google-only account bootstrap.
- `@querygraph/verdun/accounts/http`: Verdun account session cookie helpers and account-tier parsing.
- `@querygraph/verdun/accounts/store`: SQL-backed account, session, usage, and bootstrap-admin store operations.
- `@querygraph/verdun/api/public/http`: reusable Vercel-style request/response helpers.
- `@querygraph/verdun/api/public/workbench-local-adapter`: local fallback adapter registration types.
- `@querygraph/verdun/email`: provider-agnostic transactional email transport (`EmailSender`, Resend adapter, log fallback, `getEmailSender`/`emailConfigured`/`emailFrom`). App templates/recipients stay in the app.
- `@querygraph/verdun/svix`: dependency-free Svix webhook signature verification (e.g. for Resend webhooks).
- `@querygraph/verdun/db/public/account-migrations`: reusable Verdun account/user/session/usage migration manifest.
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

## Rust Crawler SDK

External crawler crates should depend on `verdun-crawler` and import through:

- `verdun_crawler::sdk`

The SDK facade re-exports the stable crawler instance registration, runtime, source adapter, source-run reporting, artifact inventory, run-manifest, cache, HTTP fetch, and generic snapshot contracts. The crate's `core`, `instances`, and `runtime` modules are internal.

## Consumer Rule

External apps consume this surface as a package dependency. App behavior, routes, crawler instances, deploy profiles, publishing workflows, generated data, and compatibility SQL remain app-owned.
