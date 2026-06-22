# Verdun App State

## Goal

Maintain Verdun as a reusable Vercel, database, frontend, deploy-check, and crawler core for external collection/review workbench apps. Verdun itself owns only the generic contracts and the neutral bundled `demo` proof instance.

## Current Slice

- `PUBLIC_SURFACE.md` defines the supported package subpaths and Rust SDK facade available to external apps.
- Generic workbench contracts live in `src/core/workbench.ts`.
- Generic frontend filtering, counts, coverage, and review state live in `src/composables/useWorkbenchView.ts`.
- Reusable Vue controls live under `src/components/workbench/` and are exposed through `frontend/workbench-ui.ts`, `frontend/workbench-style.css`, and `frontend/workbench-view.ts`.
- The bundled workbench proof is the neutral `demo` instance at `/demo/`.
- Generic Vercel workbench API routes live under `api/workbench/` and resolve instance context through explicit route/query metadata.
- Generic HTTP helpers and local workbench adapter contracts are exposed through `api/public/http.ts` and `api/public/workbench-local-adapter.ts`.
- Bundled API fallback adapters live in `api/instances/bundled-workbench-adapters.ts`; external fallback adapters belong in app packages.
- Generic database tables and reusable `workbench_*` views live in `db/migrations/0003_generic_workbench_tables.sql` and are exposed through `db/public/workbench-migrations.mjs`.
- Generic database apply/deploy helpers are exposed through `scripts/public/workbench-apply-sql.mjs` and `scripts/public/deploy-workbench-database.mjs`.
- Vite base-path selection and generated `vercel.json` routing derive from deploy-profile metadata.
- Bundled deploy-check metadata lives under `scripts/instances/demo/`; external apps opt in through `VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES` and `scripts/public/check-deployed.mjs`.
- The crawler SDK exposes generic data types, HTTP/cache helpers, artifact writers, freshness/run-manifest helpers, progress events, checkpoints, and CLI runtime entrypoints through `verdun_crawler::sdk`.
- Verdun bundles only the neutral demo crawler proof under `crawler/src/instances/demo.rs` and `crawler/instances/demo/`.
- External crawler crates own domain adapters, configs, fixtures, compatibility payloads, and registration tables while returning core `CrawlerCollection` / `CrawlerSnapshot` data for generic reloads.
- Active Verdun smokes validate the demo instance and reusable public contracts; app ownership checks belong in external app packages.

## Boundaries

Verdun owns:

- Generic workbench types, routes, UI controls, and view-model helpers.
- Generic database migrations, SQL validation, reload handoff receipts, and deploy preflights.
- Generic deploy-profile discovery and deployed-check mechanics.
- Generic crawler SDK/runtime contracts.
- The neutral demo proof instance.

External apps own:

- Product UI, domain route handlers, app-specific APIs, and local fallback adapters.
- Domain crawler crates, adapters, generated data, and compatibility payloads.
- App-specific database migrations, loaders, activation rules, and publish/readiness workflows.
- Vercel project linking, production environment variables, and app deployment wrappers.

## Verification

Current Verdun-local checks:

- `npm run smoke:demo-workbench`
- `node scripts/smoke-workbench-api.mjs`
- `node scripts/smoke-crawler-instance.mjs`
- `node scripts/smoke-check-deployed-readiness.mjs`
- `node scripts/smoke-db-apply.mjs`
- `node scripts/smoke-db-deploy.mjs`
- `cargo test --manifest-path crawler/Cargo.toml`
- `npm run prod:build`
- `npm run build:package`

Product-specific checks should live in the product app repository or package.
