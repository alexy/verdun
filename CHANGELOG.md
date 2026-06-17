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
- Added a reusable workbench instance registry and wired `api/workbench` records/status/health/review/focus routes to resolve `?instance=garbage` or `?instance=greathouse`, with Greathouse pilot reads and read-only write rejection when no instance database is configured.
- Moved generic `slug` and `stable_id` helpers into `crawler/src/core.rs`.
- Verified the checkpoint with Rust checks/tests, generic SQL export, generic loader smoke tests, Greathouse namespace export smoke tests, and `npm run smoke:all`.
- After the Garbage crawler instance splits, reverified `cargo fmt`, `cargo check`, `cargo test`, generic SQL export, `npm run smoke:generic-loader`, and `npm run smoke:all`.

Known remaining extraction work:

- Garbage-specific newsletter, Ulysses, Strongly Typed AI ontology, readiness checks, and `/rbage/` behavior still live inside Verdun.
- Legacy newsletter database/API paths still coexist with generic workbench paths.
- The Rust crawler now has a `CrawlerInstance` dispatch trait and a Garbage instance module for snapshot/domain structs, normalization, dedupe, project-count aggregation, source-run construction, manual-source freshness wording, watchlist seed item construction, provenance metadata, parsed source records, item constructors, query/focus planning, HN/Lobste.rs/dev.to/feed live fetch adapters, and manual source collection.
- Crawler instance selection supports `--instance garbage` and `--instance greathouse`.
- Workbench API routes support explicit Garbage/Greathouse instance selection, but the browser app still defaults to the Garbage newsletter composables and `/api/newsletter` compatibility routes.
- Greathouse crawler collection now dispatches through configured local JSON adapters, but it still does not have real network/browser property-source adapters.
- Greathouse is still a partial consumer rather than a full app consuming Verdun core.
