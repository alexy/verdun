# Verdun

Verdun is the reusable core for database-backed collection/review workbenches. This repository carries the generic core plus a neutral bundled demo instance; Garbage and Greathouse are external app packages in the parent workspace that extend Verdun through public package, API, database, deploy, and crawler contracts.

The first reusable boundary is now explicit:

- Verdun's `package.json` exports its app-facing JS/CSS surface as package subpaths (`verdun/frontend/*`, `verdun/api/public/*`, `verdun/db/public/*`, and `verdun/scripts/public/*`) so external apps do not import by filesystem-relative paths.
- `PUBLIC_SURFACE.md` is the source-of-truth list for external app imports; update it with `package.json` exports whenever Verdun promotes a new reusable JS/CSS/API/DB/script entrypoint.
- `EXTERNAL_APP.md` is the implementation guide for app packages that extend Verdun without moving domain behavior into the core repo.
- Generic workbench contracts live in `src/core/workbench.ts`.
- Generic frontend filtering/count/coverage logic lives in `src/composables/useWorkbenchView.ts`.
- Generic reusable Vue controls live under `src/components/workbench/`; external apps should consume them through `frontend/workbench-ui.ts`, shared workbench CSS through `frontend/workbench-style.css`, and the shared workbench view model/types through `frontend/workbench-view.ts`.
- Generic compatibility-smoke loading is exposed through `scripts/public/test-loader.mjs`; external apps can reuse Verdun's TypeScript loader contract while supplying their own Vite, Vue, and icon-library resolution.
- Generic workbench API module discovery for compatibility smokes is exposed through `scripts/public/workbench-api-modules.mjs`, so external apps do not need to hardcode Verdun's internal workbench route filenames.
- External deploy-check profile modules can validate their app-owned metadata through `scripts/public/deploy-profile-contract.mjs` before opting into Verdun's public deployed-check entrypoint.
- Garbage instance configuration and default workbench instance registration live in the parent package at `apps/garbage/src/config.ts` and `apps/garbage/src/instance-registration.ts`; Verdun core no longer imports or registers the Garbage frontend.
- Garbage-specific ontology, newsletter, browser snapshot-normalization logic, browser composables, app components, app entrypoint, app styles, newsletter API routes, deployment profile, and crawler crate live in the parent package under `apps/garbage/`; Verdun no longer imports or registers the Garbage frontend, API routes, deploy profile, or crawler implementation.
- The bundled default app is now a neutral `demo` instance at `/demo/`; it proves the reusable workbench frontend/API/deploy contract without making Garbage or Greathouse core behavior.
- Greathouse app/deploy ownership lives in the parent `@greathouse/instance` package, including its Vite entrypoint, app component, config, pilot snapshot, static snapshot, crawler crate/config/fixtures, and deploy-check profile using Verdun public frontend/crawler/deploy contracts. Verdun no longer registers a Greathouse frontend or Vercel route.
- Generic database tables (`instances`, `records`, `source_runs`, `collection_plans`, `review_state`, `focuses`) and reusable `workbench_*` views live in `db/migrations/0003_generic_workbench_tables.sql`, exposed to external apps through `db/public/workbench-migrations.mjs`; Garbage newsletter table/view compatibility migrations live under parent-owned `apps/garbage/db/instances/garbage/migrations/` and are selected by the Garbage deploy profile.
- Generic crawler structs live internally in `crawler/src/core.rs` and are exposed to app crates only through `verdun_crawler::sdk`; crawler instances return `CrawlerCollection` with a core `CrawlerSnapshot`, while any legacy item/public JSON compatibility payloads stay instance-owned. The crawler SDK/runtime contract is documented in `crawler/README.md`. Verdun bundles only a neutral demo crawler proof; Garbage and Greathouse run app-owned crawler crates.
- External Rust app crawlers should import the public SDK facade at `verdun_crawler::sdk`; it re-exports the stable instance registration, runtime, and generic snapshot contract without requiring consumers to import `core` or `instances` internals.
- Crawler instance modules export a neutral `CRAWLER_INSTANCE` registration; the shared Rust registry no longer consumes Garbage/Greathouse-named static instance symbols.
- Bundled crawler instance modules are isolated behind `crawler/src/instances/bundled.rs`; Verdun's bundled crawler is the neutral demo proof while app crawlers register against the exported `verdun-crawler` runtime from their own crates.
- Crawler default item payload, source-run, public snapshot, config, and editorial-state paths are instance-owned metadata rather than shared `crawler/data/*` CLI defaults.
- Generic Vercel workbench surfaces live under `api/workbench/`; routes resolve their instance from explicit route/query metadata while the DB helper can read/write any supplied `WorkbenchInstance` namespace.
- Generic HTTP helpers and local workbench adapter contracts are exposed to external apps through `api/public/http.ts` and `api/public/workbench-local-adapter.ts`; instance-specific fallback adapters export neutral registration metadata from their own namespace.
- Vite base-path selection and `vercel.json` routing derive from registered deploy profiles; Verdun's default bundled profile is the neutral demo at `/demo/`, while Garbage owns its own Vercel config under `apps/garbage/vercel.json` for `/rbage/`.
- Instance deploy-check modules export neutral `deployCheckProfile` metadata, and the shared deployment registry discovers `scripts/instances/*/deploy-checks.mjs` profiles by convention.
- Garbage deploy-check profile metadata and hooks are parent-owned at `apps/garbage/scripts/deploy-checks.mjs`, `apps/garbage/scripts/check-deployed.mjs`, `apps/garbage/scripts/deployed-check-smoke-fixture.mjs`, and `apps/garbage/scripts/deployed-draft-checks.mjs`; Garbage opts into Verdun's generic deployed checker through the `scripts/public/check-deployed.mjs` entrypoint and `VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES`.
- Garbage deploy-profile metadata declares an external npm-workspace command runner for `@garbage/instance`; shared orchestration such as `smoke:all` and `smoke:browser` now executes Garbage commands through that package instead of Verdun-local `garbage:*` package scripts.
- Deployed draft/readiness checks are deploy-profile hooks; Garbage owns newsletter draft validation under parent-owned `apps/garbage/scripts/`, while the shared deployment checker validates only generic route, snapshot, status, and health mechanics.
- Newsletter routes, scripts, and compatibility database tables are Garbage-owned surfaces in the parent app package, not Verdun core behavior.
- Verdun smoke scripts validate Verdun's own bundled demo core and no longer read `../apps/garbage/*`; external app ownership checks belong in the app package.

The current core proof points are intentionally generic:

- Vue/Vite workbench shell deployed by Vercel.
- Vite base path and generated `vercel.json` routing driven by deploy-profile metadata.
- Vercel serverless API routes reading and writing an external Postgres database through generic workbench routes.
- Reusable Rust crawler/runtime crate that collects instance-owned records and exports SQL for the generic database shape.
- Bundled demo crawler adapters for local records, local diagnostics, HTTP JSON, and HTTP status diagnostics, all preserving the same `CrawlerSnapshot` contract.
- Generic workbench item review, focus notes, source-run metadata, collection plans, and provenance stored in the reusable `workbench_*` views.
- Generic app and instance registries that discover bundled proof registrations by convention while external apps mount their own entrypoints.

Garbage-specific operations are documented in the parent app package at `../apps/garbage/README.md`. Verdun docs should describe the reusable contracts and bundled proof instance only; Garbage newsletter publishing, Strongly Typed AI ontology, `/rbage/` deployment, Ulysses export, and legacy newsletter compatibility SQL belong in the Garbage package docs.

The ownership split is in place: Garbage owns its frontend app, newsletter API routes/store, crawler crate, deployment-check wrapper, publishing scripts, and compatibility SQL; Greathouse owns its frontend app, crawler crate, and deploy profile; Verdun's own default is the neutral demo. External apps consume Verdun's JS/CSS/API/DB/script public surface through package subpaths. The next architectural work is to harden crawler SDK packaging, reduce migration-era smoke/runtime naming, and keep Garbage, Greathouse, and future apps on the same core contracts.

## Local app

```sh
npm install
npm run dev:app
```

Open `http://127.0.0.1:5176/demo/`.

Without `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`, the workbench API uses the bundled proof instance's static snapshot and reports read-only local persistence. External apps may provide their own local fallback adapters through `api/public/workbench-local-adapter.ts`.

Run `npm run vercel:config` in Verdun after changing bundled deploy profiles; it regenerates Verdun `vercel.json` routes for the bundled demo app path. External apps own their own Vercel config and may opt into Verdun's public deployment checker through `verdun/scripts/public/check-deployed`.

After deploying Verdun's bundled proof app, verify the route and data endpoints with:

```sh
npm run check:deployed
npm run check:deployed -- --require-database
```

`check:deployed` validates the deploy-profile base path, static snapshot, generic workbench records/status/health APIs, and profile-specific readiness hooks when present. Add `--require-database` after configuring external Postgres to prove the deployed API reports writable `database` persistence with enough loaded records, source runs, and query plans. For a local preview server started with `npm run prod:app`, use `npm run check:preview`; that runs the same route/static-snapshot checks without requiring Vercel API routes.

## Database

Apply migrations through the guarded helpers rather than applying every SQL file by directory. Verdun's reusable database contract lives in `db/migrations/0003_generic_workbench_tables.sql` and is exposed to external apps through `db/public/workbench-migrations.mjs`; Garbage's legacy newsletter tables and fallback `workbench_*` view overlay live under parent-owned `apps/garbage/db/instances/garbage/migrations/` and are selected by the Garbage deploy profile.

Use the guarded deployment helper when moving a crawler snapshot into the external database:

```sh
npm run db:deploy
npm run db:deploy -- --apply
```

Without `--apply`, the helper regenerates `/tmp/verdun-workbench-load.sql` from the default deploy profile snapshot, validates it against the paired snapshot, and stops before touching Postgres. With `--apply`, it also verifies Vercel production has `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL` configured, applies the migration and SQL load through `psql`, and runs `npm run check:deployed -- --require-database` to prove the public API is backed by the external database. Use `--skip-vercel-env` or `--skip-deployed-check` only for local database drills.

## Crawler

The reusable crawler core lives under `crawler/src/`; crawler instances own domain adapters and return a core `CrawlerCollection`. Verdun exports the `verdun-crawler` SDK/runtime through `verdun_crawler::sdk` and bundles only the neutral demo proof instance. Garbage and Greathouse own their crawler configs, fixtures, Rust instance implementations, and binaries under their parent app packages; each depends on the local Verdun crawler path with the matching crate version pinned and registers its own instance locally. Generic SQL export runs through the core `CrawlerSnapshot` shape instead of writing directly from app-specific payloads.

```sh
cargo run --manifest-path crawler/Cargo.toml -- collect --instance demo --generic-out /tmp/demo-snapshot.json
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot /tmp/demo-snapshot.json --out /tmp/verdun-load.sql --instance demo
npm run db:apply -- --sql /tmp/verdun-load.sql --snapshot /tmp/demo-snapshot.json
```

`collect` writes the selected bundled crawler instance's item payload, source-health rows, and public snapshot to instance-owned default paths unless `--out`, `--source-runs-out`, `--public-out`, or `--generic-out` are supplied. Verdun's bundled crawler proof is neutral demo-shaped; Garbage and Greathouse collection use parent-owned crates documented in their app package READMEs. Add `--generic-out path/to/snapshot.json` to always write the core `CrawlerSnapshot` beside any compatibility payload. `collect` and `queries` read the selected instance's default editorial state when it exists, so saved focus requests can add `focus_terms` to matching collection plans; use `--editorial-state path/to/state.json` to point at an exported editorial state file.
`export-sql --snapshot` loads a cohesive public or generic snapshot into SQL for external Postgres, keeping records, source-health rows, collection-plan rows, and the snapshot `generated_at` collection timestamp from the same crawler run. By default it emits the reusable Verdun contract load into `instances`, `records`, `source_runs`, and `collection_plans`. Instance-specific compatibility targets are plain target strings handled by the selected crawler instance, not Verdun core targets. The generic export defaults to the selected instance namespace and can be pointed at another namespace with `--instance`, `--instance-name`, and `--base-path`. The older `--input` plus `--source-runs` path remains available for debugging split files. `npm run db:apply` validates the SQL against the paired snapshot and stops as a dry run by default; pass `--apply` with `POSTGRES_URL`, `DATABASE_URL`, `NEON_DATABASE_URL`, or `--database-url` to apply sorted migrations and then the generated load through `psql`.
