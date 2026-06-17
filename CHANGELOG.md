# Changelog

## 2026-06-16

- Started extracting Verdun as the reusable core rather than treating Garbage as the app boundary.
- Added generic workbench contracts, generic database tables, generic API helper paths, and shared workbench UI controls.
- Moved Garbage-specific app configuration, ontology, crawler config, and manual social imports behind instance directories.
- Added a Greathouse pilot fixture that exercises the generic `WorkbenchSnapshot` and generic workbench view path.
- Added generic crawler snapshot structs: `CrawlerSnapshot`, `NormalizedRecord`, and `NormalizedCollectionPlan`.
- Changed generic SQL export to adapt the current Garbage newsletter snapshot into the generic crawler snapshot shape before writing Verdun generic tables.
- Verified the checkpoint with Rust checks/tests, generic SQL export, generic loader smoke tests, Greathouse namespace export smoke tests, and `npm run smoke:all`.

Known remaining extraction work:

- Garbage-specific newsletter, Ulysses, Strongly Typed AI ontology, readiness checks, and `/rbage/` behavior still live inside Verdun.
- Legacy newsletter database/API paths still coexist with generic workbench paths.
- The Rust crawler has reusable core data structures but is not yet a clean instance-adapter framework.
- Greathouse is still a pilot fixture rather than a full app consuming Verdun core.
