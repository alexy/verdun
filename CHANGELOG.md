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
- Moved generic `slug` and `stable_id` helpers into `crawler/src/core.rs`.
- Verified the checkpoint with Rust checks/tests, generic SQL export, generic loader smoke tests, Greathouse namespace export smoke tests, and `npm run smoke:all`.
- After the Garbage crawler instance splits, reverified `cargo fmt`, `cargo check`, `cargo test`, generic SQL export, `npm run smoke:generic-loader`, and `npm run smoke:all`.

Known remaining extraction work:

- Garbage-specific newsletter, Ulysses, Strongly Typed AI ontology, readiness checks, and `/rbage/` behavior still live inside Verdun.
- Legacy newsletter database/API paths still coexist with generic workbench paths.
- The Rust crawler now has a Garbage instance module for snapshot/domain structs, normalization, dedupe, project-count aggregation, source-run construction, manual-source freshness wording, watchlist seed item construction, and provenance metadata, but live/manual fetch adapters and live item construction still live in `crawler/src/main.rs`.
- Greathouse is still a pilot fixture rather than a full app consuming Verdun core.
