# Verdun Public Surface

Verdun's reusable app contract is intentionally smaller than its repository tree. External apps such as Garbage should import only the package subpaths and Rust SDK facade listed here. Other files are implementation detail unless they are promoted into this document and `package.json` exports together.

For the full app-package shape, see `EXTERNAL_APP.md`.

## JavaScript, TypeScript, and CSS Exports

These package subpaths are the supported external app surface:

- `verdun/frontend/workbench-ui`: shared Vue workbench controls.
- `verdun/frontend/workbench-style.css`: shared workbench shell and component CSS.
- `verdun/api/public/http`: reusable Vercel-style request/response helpers.
- `verdun/api/public/workbench-local-adapter`: local fallback adapter registration types.
- `verdun/db/public/workbench-migrations`: generic workbench migration manifest.
- `verdun/scripts/public/check-deployed`: deploy/readiness checker entrypoint for external app wrappers.
- `verdun/scripts/public/deploy-profile-contract`: deploy-check profile validator for external app profile modules.
- `verdun/scripts/public/test-loader`: TypeScript compatibility-smoke loader contract.
- `verdun/scripts/public/workbench-api-modules`: generic workbench API module manifest for app compatibility smokes.

The implementation directories behind those exports are still Verdun-owned. Apps should not import `verdun/src/core/`, `verdun/api/core/`, `verdun/db/core/`, `verdun/scripts/core/`, or raw component files directly.

## Rust Crawler SDK

External crawler crates should depend on `verdun-crawler` and import through:

- `verdun_crawler::sdk`

The SDK facade re-exports the stable crawler instance registration, runtime, source, and generic snapshot contracts. The crate's `core`, `instances`, and `runtime` modules are internal.

## Current Consumers

Garbage consumes this surface from `apps/garbage/` as a local workspace dependency while Verdun remains nested in the same checkout. That local dependency is a development arrangement, not an ownership shortcut: Garbage owns its app, newsletter routes, crawler instance, deploy profile, publishing scripts, and compatibility SQL.

Greathouse remains the bundled Verdun proof instance for now. The target shape is the same: app-specific crawling, deployment, and product UI can move outside Verdun while continuing to reuse this public surface.
