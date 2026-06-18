# Changelog

## 2026-06-18

- Moved the Grust watchlist audit and its smoke test under `scripts/instances/garbage/`, with package commands renamed to `garbage:audit:grust` and `garbage:smoke:grust-watchlist`.
- Moved Garbage-only newsletter/publishing smoke scripts under `scripts/instances/garbage/` and kept the public package surface on explicit `garbage:smoke:*` commands.
- Renamed Garbage-only newsletter/publishing smoke package commands to `garbage:smoke:*` and updated `smoke:all` to call those explicit instance checks instead of generic `smoke:*` aliases.
- Changed Vite base-path selection and `vercel.json` routing to derive from registered deploy profiles; `npm run vercel:config` now generates rewrites for both Garbage and Greathouse app paths while Garbage remains the default root redirect.
- Changed Rust crawler instance resolution to use a `REGISTERED_CRAWLER_INSTANCES` table with default metadata instead of hard-coded `garbage`/`greathouse` resolver branches.
- Moved legacy Garbage newsletter snapshot and split-file payload loading out of `crawler/src/main.rs` and into the Garbage crawler instance module, leaving shared CLI code to route through an explicit instance-owned compatibility function.
- Changed `verdun-crawler queries` to print generic `NormalizedCollectionPlan` JSON and renamed the crawler CLI snapshot loaders so generic snapshot loading and Garbage newsletter compatibility loading are explicit.
- Changed Greathouse crawler adapters to emit core `NormalizedRecord` values directly instead of constructing Garbage `NewsItem` values internally.
- Changed the crawler instance trait to return core `CrawlerCollection` output instead of exposing Garbage `NewsItem` vectors; the shared CLI now writes generic snapshots from instance collection output, and Greathouse public collection snapshots use the generic `records`/`collection_plans` shape.
- Updated Verdun app/operator docs to reflect the current generic-default SQL export, core crawler collection output, and instance-owned Garbage compatibility paths.

## 2026-06-17

- Added `verdun-crawler collect --generic-out` so collection can write a core `CrawlerSnapshot` artifact with `records`, `source_runs`, and `collection_plans` alongside the existing legacy public snapshot; Greathouse smoke coverage now exports SQL and validates the generic loader from that core artifact directly.
- Removed the old `api/newsletter/*` compatibility route files; Garbage newsletter APIs are now exposed through the explicit `api/garbage/newsletter/*` namespace.
- Exposed the Garbage legacy news-item to core `NormalizedRecord` projection as an instance boundary function, preparing the remaining crawler `NewsItem` trait cleanup.
- Moved crawler editorial focus state into `crawler/src/core.rs`; the shared crawler trait no longer imports that focus type from the Garbage module.
- Changed the crawler instance trait to expose core `NormalizedCollectionPlan` values instead of the Garbage `ProjectQueryPlan` type; legacy query-plan JSON is now only produced at the public snapshot/CLI compatibility boundary.
- Added a Zillow-shaped Greathouse listing adapter and fixture so a second production property-source format refills the same generic crawler snapshot and workbench SQL contract.
- Changed generic SQL export to load from the core `CrawlerSnapshot` contract instead of the Garbage `ExportPayload`; the legacy newsletter target remains the explicit Garbage payload path.
- Moved crawler CLI default config paths, public snapshot paths, instance display names, and base paths onto crawler instance metadata; shared `main.rs` no longer embeds Garbage path/base defaults.
- Moved the legacy `newsletter_*` SQL exporter out of crawler `main.rs` and into the Garbage crawler instance module, with smoke coverage preventing the shared CLI from re-embedding newsletter table exports.
- Changed deployed-check smoke coverage to derive local app URLs, static snapshot paths, source snapshot input, and draft API paths from deploy profiles instead of duplicating Garbage route defaults.
- Moved the legacy newsletter SQL loader smoke under `scripts/instances/garbage/` and exposed it as `garbage:smoke:loader`; `smoke:generic-loader` remains the reusable workbench SQL validator.
- Removed the generic Garbage publishing package aliases (`draft`, `review:gaps`, `ulysses:*`, and `ghost:*`); publishing commands now use explicit `garbage:*` package names.
- Removed the unused generic publishing wrapper scripts (`scripts/newsletter-draft.mjs`, `scripts/publish-ghost.mjs`, and `scripts/source-gap-review.mjs`); Garbage publishing remains available through explicit `scripts/garbage-*.mjs` wrappers and `garbage:*` package commands.
- Removed unused generic `src/lib/newsletter.ts`, `src/lib/ontology.ts`, and `src/lib/snapshot.ts` compatibility re-exports so Garbage newsletter, ontology, and snapshot logic are only exposed from the Garbage instance namespace.
- Added a Greathouse deploy-check profile with preview URL, static snapshot, count gates, and required subject/plan metadata; Greathouse deployed checks can now run from profile metadata instead of explicit CLI gates.
- Changed deploy-check profile selection to use registered profile metadata with an explicit default flag instead of returning the Garbage profile directly.
- Added deploy-profile base paths and made `scripts/deploy-workbench-database.mjs` carry profile `basePath` and `staticSnapshotPath` into deployed checks, so Greathouse deployment preflights no longer need explicit asset-base/static-snapshot arguments.
- Moved workbench instance registration metadata into instance-owned files (`src/instances/garbage/instance.ts` and `src/instances/greathouse/instance.ts`); the shared instance registry now consumes `registeredWorkbenchInstances` instead of importing Garbage or Greathouse config/pilot modules directly.
- Updated Greathouse workbench smoke coverage to enforce that default-instance and static-snapshot metadata stay in instance registration files while `src/instances/registry.ts` only consumes registration metadata.
- Moved concrete Vue app component imports into instance-owned registrations (`src/instances/garbage/app.ts` and `src/instances/greathouse/app.ts`); the shared app resolver now consumes `registeredWorkbenchApps` instead of importing Garbage or Greathouse components directly.
- Updated Greathouse workbench smoke coverage to enforce that concrete app component imports stay in instance registration files while `src/instances/app-registry.ts` only consumes registration metadata.
- Moved root Vue app component selection into `src/instances/app-registry.ts`; `src/App.vue` now stays a generic shell and no longer imports concrete Garbage or Greathouse app components directly.
- Updated Greathouse workbench smoke coverage to enforce that concrete app imports stay in the instance app registry, while the root shell only calls the generic app resolver.
- Moved legacy newsletter compatibility table reporting out of the generic workbench health route and into instance-adapter metadata; Greathouse health now reports no Garbage compatibility tables.
- Moved Garbage deployment-check defaults into `scripts/instances/garbage/deploy-checks.mjs`; the generic deployed-check script now consumes instance deploy profiles instead of embedding Garbage URL, snapshot, required-subject, and draft API assumptions.
- Added `sourceSnapshotPath` to deploy profiles and made generic workbench database apply/deploy scripts resolve their default snapshot and default instance behavior through profile metadata instead of embedding the Garbage newsletter snapshot path or special-casing `garbage`.
- Added a profile-backed `scripts/check-preview.mjs`; `npm run check:preview` no longer embeds the Garbage `/rbage/` preview URL directly and instead resolves the preview URL from instance deploy profile metadata.
- Changed `scripts/smoke-all.mjs` to resolve its default source snapshot through the default deploy profile instead of embedding the Garbage newsletter snapshot path.
- Changed local UI smoke defaults (`smoke-browser`, `smoke-responsive`, and `smoke-app`) to resolve their preview URLs from deploy profile metadata instead of embedding Garbage `/rbage/` URLs directly.
- Changed the generic SQL loader smoke to resolve its default snapshot, instance id, base path, and required subjects/plans through deploy profile metadata instead of embedding Garbage-specific expectations.
- Changed `smoke-db-apply` and `smoke-db-deploy` to resolve their default source snapshot through deploy profile metadata instead of embedding the Garbage newsletter snapshot path.
- Changed `src/instances/registry.ts` to store default-instance and static-snapshot behavior in registration metadata instead of branching directly on Garbage or Greathouse instances; app resolution now falls back through the registered default.
- Moved Garbage local workbench adapter metadata into `api/instances/garbage/workbench.ts`; the generic `api/workbench/instance-adapters.ts` now uses adapter registration entries instead of importing Garbage config or embedding newsletter compatibility tables.
- Moved the local workbench adapter registration list into `api/instances/workbench-adapters.ts`, so the generic `api/workbench/instance-adapters.ts` no longer imports instance-specific adapter modules directly.

## 2026-06-16

- Started extracting Verdun as the reusable core rather than treating Garbage as the app boundary.
- Added generic workbench contracts, generic database tables, generic API helper paths, and shared workbench UI controls.
- Moved Garbage-specific app configuration, ontology, crawler config, and manual social imports behind instance directories.
- Added a Greathouse pilot fixture that exercises the generic `WorkbenchSnapshot` and generic workbench view path.
- Added generic crawler snapshot structs: `CrawlerSnapshot`, `NormalizedRecord`, and `NormalizedCollectionPlan`.
- Changed generic SQL export to adapt the current Garbage newsletter snapshot into the generic crawler snapshot shape before writing Verdun generic tables.
- Moved Garbage crawler snapshot/domain structs and generic snapshot normalization into `crawler/src/instances/garbage.rs`, leaving current collection behavior unchanged.
- Moved Garbage news dedupe policy and project-count source-health aggregation into `crawler/src/instances/garbage.rs`.
- Moved Garbage source-run construction and manual-source freshness wording into `crawler/src/instances/garbage.rs`.
- Moved Garbage watchlist seed item construction and provenance metadata generation into `crawler/src/instances/garbage.rs`.
- Moved Garbage parsed source record structs and live/manual item constructors into `crawler/src/instances/garbage.rs`.
- Moved Garbage editorial-focus parsing, query-plan generation, review-target generation, live-search term selection, and dev.to tag derivation into `crawler/src/instances/garbage.rs`.
- Moved the Garbage Hacker News live fetch adapter and HN matching into `crawler/src/instances/garbage.rs`.
- Moved the Garbage Lobste.rs live fetch adapter, HTML parser, and matching into `crawler/src/instances/garbage.rs`.
- Moved the Garbage dev.to live fetch adapter and matching into `crawler/src/instances/garbage.rs`.
- Moved the Garbage RSS/Atom feed fetch adapter, parser, and matching into `crawler/src/instances/garbage.rs`.
- Moved Garbage manual source collection and matching into `crawler/src/instances/garbage.rs`.
- Added a crawler instance dispatch boundary in `crawler/src/instances/mod.rs`; `main.rs` now calls the default `CrawlerInstance` instead of invoking Garbage source adapters directly.
- Added explicit crawler instance selection for `collect`, `verify`, and `queries`, with smoke coverage that verifies `garbage` works and unsupported instances fail clearly.
- Added a Greathouse crawler instance scaffold and `crawler/instances/greathouse/config.toml`; smoke coverage now verifies Greathouse collection, generic SQL export, and generic loader compatibility.
- Moved Greathouse scaffold records into `crawler/instances/greathouse/fixtures/` and load them through per-source `fixture_path` config rather than generating all records in Rust.
- Added a Greathouse source-adapter boundary so fixture loading is one replaceable adapter behind `GreathouseSourceAdapter`.
- Added explicit Greathouse local JSON adapter selection (`local-listing-json` and `local-diagnostic-json`) so review targets and record provenance use configured adapter IDs instead of fixture-only defaults.
- Added Greathouse HTTP JSON adapters (`http-listing-json` and `http-diagnostic-json`) behind `GreathouseSourceAdapter`, with local HTTP-server smoke coverage that verifies provenance, source-run messages, and generic SQL compatibility without external network dependency.
- Added a Greathouse HTTP status diagnostic adapter (`http-status-diagnostic`) that turns blocked or unreachable source probes into normalized diagnostic records with `blocked_http` provenance instead of failing the crawl.
- Added a Greathouse Redfin listing adapter (`redfin-listing-json`) that normalizes property-shaped external crawler output into the same generic snapshot/database contract while preserving price, bed/bath, market-age, comparable-count, and source-status details in raw provenance.
- Added a Greathouse browser diagnostic adapter (`browser-diagnostic-json`) that ingests external browser-run source diagnostics and preserves rendered-page evidence such as final URL, HTTP status, blocked reason, screenshot path, visible text, and console errors in the generic snapshot provenance.
- Added Greathouse source-run project counts so source health can report which target each listing or diagnostic source affected.
- Added a reusable workbench instance registry and wired `api/workbench` records/status/health/review/focus routes to resolve `?instance=garbage` or `?instance=greathouse`, with Greathouse pilot reads and read-only write rejection when no instance database is configured.
- Added explicit Garbage newsletter API routes under `api/garbage/newsletter/*` and moved draft, health, UI download links, and deployment checks to that namespace.
- Switched the browser snapshot composable to load Garbage through `api/workbench/records?instance=garbage` and write votes/focuses through generic workbench review/focus routes; the newsletter draft/editorial-state APIs remain Garbage-specific compatibility surfaces.
- Added a generic workbench state import route at `api/workbench/state.ts` and switched Garbage browser editorial-state imports to `/api/workbench/state?instance=garbage`.
- Updated deployment readiness checks to validate generic workbench records/status/health APIs while still checking the Garbage newsletter draft API.
- Moved the Strongly Typed AI ontology helper implementation under `src/instances/garbage/ontology.ts`.
- Moved Garbage newsletter/draft/readiness/export logic under `src/instances/garbage/newsletter.ts`.
- Moved Garbage snapshot normalization under `src/instances/garbage/snapshot.ts`.
- Moved Garbage-specific newsletter hero and draft preview components under `src/instances/garbage/components/`, leaving the shared `WorkbenchHero` in the generic component tree.
- Moved the remaining Garbage newsletter app panels and newsletter composables under `src/instances/garbage/components/` and `src/instances/garbage/composables/`, leaving `src/components/` for app-shell and generic workbench controls.
- Moved the Garbage Vue app composition into `src/instances/garbage/GarbageApp.vue`; root `src/App.vue` is now only a thin instance shell.
- Added a Greathouse pilot Vue app at `src/instances/greathouse/GreathouseApp.vue` and wired the root shell to mount it for `/greathouse/` paths using the generic workbench view and review controls.
- Added registry-backed app instance path resolution so the root Vue shell asks the instance registry which app to mount for `/rbage/` and `/greathouse/`.
- Extracted generic API request/response helpers to `api/core/http.ts`; `api/workbench` routes now use the generic helper.
- Added a Garbage API workbench fallback adapter under `api/instances/garbage/workbench.ts`; `api/workbench/_db.ts` no longer imports `api/newsletter/_db.ts` directly for static/local-file mode.
- Added `api/workbench/instance-adapters.ts` so the generic workbench DB helper resolves no-database instance reads and writes through local instance adapters instead of importing the Garbage adapter directly.
- Moved Garbage newsletter API store logic under `api/instances/garbage/newsletter-store.ts`.
- Moved Garbage newsletter route implementations under `api/instances/garbage/newsletter/`; the public `api/garbage/newsletter/*` files act as explicit Garbage API shims.
- Moved Garbage publishing helper implementations under `scripts/instances/garbage/`; explicit Garbage draft, Ghost publish, and source-gap scripts now act as CLI/module wrappers.
- Added explicit Garbage publishing package scripts (`garbage:draft`, `garbage:review:gaps`, `garbage:ulysses:*`, and `garbage:ghost:*`).
- Moved Garbage newsletter SQL reload helper implementations under `scripts/instances/garbage/`; the old public apply/deploy database compatibility wrappers have been removed.
- Moved generic `slug` and `stable_id` helpers into `crawler/src/core.rs`.
- Changed `verdun-crawler export-sql` to default to the generic workbench SQL target; Garbage newsletter table export is now an explicit `--target newsletter` compatibility path.
- Added generic workbench database apply/deploy scripts and made the default `db:apply`/`db:deploy` package scripts validate/load generic workbench SQL; legacy newsletter table loading is now available only through explicit Garbage package commands `garbage:db:apply:newsletter` and `garbage:db:deploy:newsletter`.
- Changed `npm run smoke:all` to generate its primary SQL through the default generic `export-sql` path, then run the legacy newsletter SQL export only as an explicit compatibility check.
- Made `scripts/check-deployed.mjs` instance-aware with configurable static snapshot paths, asset bases, count gates, and required subjects; Garbage still checks the newsletter draft API, while non-Garbage instances validate only the generic workbench deployment surface unless draft checks are explicitly enabled.
- Made `scripts/deploy-workbench-database.mjs` carry `--instance`, `--base-path`, and `--static-snapshot` into deployed checks, with smoke coverage for a Greathouse generic workbench deployment preflight.
- Verified the checkpoint with Rust checks/tests, generic SQL export, generic loader smoke tests, Greathouse namespace export smoke tests, and `npm run smoke:all`.
- After the Garbage crawler instance splits, reverified `cargo fmt`, `cargo check`, `cargo test`, generic SQL export, `npm run smoke:generic-loader`, and `npm run smoke:all`.

Known remaining extraction work:

- Garbage-specific newsletter, Ulysses, Strongly Typed AI ontology, readiness checks, and `/rbage/` behavior still live inside Verdun.
- Legacy newsletter database/API paths still coexist with generic workbench paths, but default SQL export and default package database commands now target the generic workbench contract.
- The Rust crawler now has a `CrawlerInstance` dispatch trait and a Garbage instance module for snapshot/domain structs, normalization, dedupe, project-count aggregation, source-run construction, manual-source freshness wording, watchlist seed item construction, provenance metadata, parsed source records, item constructors, query/focus planning, HN/Lobste.rs/dev.to/feed live fetch adapters, and manual source collection.
- Crawler instance selection supports `--instance garbage` and `--instance greathouse`.
- Workbench API routes support explicit Garbage/Greathouse instance selection, and the browser app now reads/reviews/focuses/imports Garbage state through generic workbench routes.
- Newsletter draft generation, readiness, Ulysses export, Ghost publishing helpers, SQL reload helpers, editorial-state import, ontology rendering, snapshot normalization, Garbage-specific UI panels/composables/app composition, and newsletter route implementations are now implemented under the Garbage instance, with explicit Garbage API/package commands.
- Workbench API routes no longer depend on the newsletter HTTP helper path or the legacy newsletter DB helper path for local static/local-file mode.
- Garbage local static/local-file fallback now reuses the Garbage API instance newsletter store internally.
- Greathouse crawler collection now dispatches through configured local JSON, HTTP JSON, and HTTP status-diagnostic adapters, and Greathouse has a pilot Vue app consuming generic workbench controls, but it still does not have source-specific browser/property adapters.
- Greathouse is still a pilot consumer, not a complete production app.
