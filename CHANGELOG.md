# Changelog

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
- Added a reusable workbench instance registry and wired `api/workbench` records/status/health/review/focus routes to resolve `?instance=garbage` or `?instance=greathouse`, with Greathouse pilot reads and read-only write rejection when no instance database is configured.
- Switched the browser snapshot composable to load Garbage through `api/workbench/records?instance=garbage` and write votes/focuses through generic workbench review/focus routes; the newsletter draft/editorial-state APIs remain Garbage-specific compatibility surfaces.
- Added a generic workbench state import route at `api/workbench/state.ts` and switched Garbage browser editorial-state imports to `/api/workbench/state?instance=garbage`.
- Updated deployment readiness checks to validate generic workbench records/status/health APIs while still checking the Garbage newsletter draft API.
- Moved the Strongly Typed AI ontology helper implementation under `src/instances/garbage/ontology.ts`; the generic `src/lib/ontology.ts` path is now only a compatibility re-export.
- Moved Garbage newsletter/draft/readiness/export logic under `src/instances/garbage/newsletter.ts`; the generic `src/lib/newsletter.ts` path is now only a compatibility re-export.
- Moved Garbage-specific newsletter hero and draft preview components under `src/instances/garbage/components/`, leaving the shared `WorkbenchHero` in the generic component tree.
- Moved the remaining Garbage newsletter app panels and newsletter composables under `src/instances/garbage/components/` and `src/instances/garbage/composables/`, leaving `src/components/` for app-shell and generic workbench controls.
- Extracted generic API request/response helpers to `api/core/http.ts`; `api/workbench` routes now use the generic helper while `api/newsletter/_http.ts` remains a compatibility re-export.
- Added a Garbage API workbench fallback adapter under `api/instances/garbage/workbench.ts`; `api/workbench/_db.ts` no longer imports `api/newsletter/_db.ts` directly for static/local-file mode.
- Moved Garbage newsletter API store logic under `api/instances/garbage/newsletter-store.ts`; `api/newsletter/_db.ts` is now only a compatibility re-export.
- Moved Garbage newsletter route implementations under `api/instances/garbage/newsletter/`; the public `api/newsletter/*` files now act as compatibility shims.
- Moved Garbage publishing helper implementations under `scripts/instances/garbage/`; the public newsletter draft, Ghost publish, and source-gap scripts now act as compatibility CLI/module wrappers.
- Moved Garbage newsletter SQL reload helper implementations under `scripts/instances/garbage/`; the public apply/deploy database scripts now act as compatibility CLI/module wrappers.
- Moved generic `slug` and `stable_id` helpers into `crawler/src/core.rs`.
- Changed `verdun-crawler export-sql` to default to the generic workbench SQL target; Garbage newsletter table export is now an explicit `--target newsletter` compatibility path.
- Verified the checkpoint with Rust checks/tests, generic SQL export, generic loader smoke tests, Greathouse namespace export smoke tests, and `npm run smoke:all`.
- After the Garbage crawler instance splits, reverified `cargo fmt`, `cargo check`, `cargo test`, generic SQL export, `npm run smoke:generic-loader`, and `npm run smoke:all`.

Known remaining extraction work:

- Garbage-specific newsletter, Ulysses, Strongly Typed AI ontology, readiness checks, and `/rbage/` behavior still live inside Verdun.
- Legacy newsletter database/API paths still coexist with generic workbench paths, but default SQL export now targets the generic workbench contract.
- The Rust crawler now has a `CrawlerInstance` dispatch trait and a Garbage instance module for snapshot/domain structs, normalization, dedupe, project-count aggregation, source-run construction, manual-source freshness wording, watchlist seed item construction, provenance metadata, parsed source records, item constructors, query/focus planning, HN/Lobste.rs/dev.to/feed live fetch adapters, and manual source collection.
- Crawler instance selection supports `--instance garbage` and `--instance greathouse`.
- Workbench API routes support explicit Garbage/Greathouse instance selection, and the browser app now reads/reviews/focuses/imports Garbage state through generic workbench routes.
- Newsletter draft generation, readiness, Ulysses export, Ghost publishing helpers, SQL reload helpers, editorial-state import, ontology rendering, Garbage-specific UI panels, newsletter composables, and newsletter route implementations are now implemented under the Garbage instance, but public compatibility API/script names still remain.
- Workbench API routes no longer depend on the newsletter HTTP helper path or the legacy newsletter DB helper path for local static/local-file mode.
- Garbage local static/local-file fallback now reuses the Garbage API instance newsletter store internally, while the legacy `api/newsletter/_db.ts` path remains as a compatibility re-export.
- Greathouse crawler collection now dispatches through configured local and HTTP JSON adapters, but it still does not have source-specific browser/property adapters.
- Greathouse is still a partial consumer rather than a full app consuming Verdun core.
