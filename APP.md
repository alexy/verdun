# Verdun App State

## Goal

Maintain Verdun as a reusable Vercel plus database workbench core filled by external Rust crawlers. Garbage is the Strongly Typed AI/newsletter instance running at `collected.ga/rbage/`; it shows candidate news items, supports editorial upvote/downvote triage, accepts collection-focus requests, and exports local Markdown for editing/publishing with Ulysses.

## Current Slice

- The crawler SDK now exposes reusable JSON disk cache and artifact writer helpers through `verdun_crawler::sdk`: `JsonDiskCache`, `CacheRead`, `write_pretty_json`, and `write_text`. Verdun's own crawler runtime uses these helpers for collection/export output writes, and tests cover deterministic cache paths plus parent-directory creation.
- Verdun is the reusable core; the live newsletter app is the external Garbage package layered on top of Verdun public contracts.
- `PUBLIC_SURFACE.md` defines the supported Verdun package subpaths and Rust SDK facade available to external apps.
- Generic workbench contracts live in `src/core/workbench.ts`; Garbage config, default instance registration, newsletter, ontology, browser snapshot normalization, API routes/store, frontend app, deployment wrapper, and crawler crate live in the parent package under `apps/garbage/`.
- Verdun's bundled default workbench is now the neutral `demo` instance at `/demo/`; it exists only to prove the reusable frontend/API/deploy contract without naming Garbage or Greathouse as core behavior.
- The parent workspace now has a Greathouse external app package at `apps/greathouse/`, including its Vite entrypoint, property workbench component, config, pilot snapshot, static snapshot, crawler crate/config/fixtures, deploy-check profile, and smoke fixture.
- Verdun no longer carries bundled Greathouse frontend, crawler, or deploy profile code; Greathouse app/crawler/deploy ownership is parent-owned.
- Generic compatibility-smoke TypeScript loading lives behind `scripts/public/test-loader.mjs`; Garbage consumes that public loader contract while resolving Vite, Vue, and Lucide from the app package.
- Generic workbench API module paths for compatibility smokes live behind `scripts/public/workbench-api-modules.mjs`; Garbage consumes that public manifest instead of naming Verdun workbench route files directly.
- Greathouse's pilot app, route, deploy profile, and static snapshot are owned by the parent `@greathouse/instance` package and consume Verdun public frontend/deploy contracts.
- Vue/Vite app with a newsroom triage interface.
- Reusable workbench controls now live under `src/components/workbench/` and are exposed to external apps through `frontend/workbench-ui.ts` plus `frontend/workbench-style.css`; Garbage-specific editorial, inbox, draft, source-health, and news-card UI lives under parent-owned `apps/garbage/src/app/components/`.
- Generic frontend filtering/count/coverage logic lives in `src/composables/useWorkbenchView.ts`; Garbage-specific snapshot loading, optimistic vote/focus persistence, draft state, and readiness derivation live under parent-owned `apps/garbage/src/app/composables/`.
- Garbage-specific newsletter app components, publishing/ontology/source-gap styles, browser composables, and app entrypoint live under parent-owned `apps/garbage/src/`; root `src/style.css` now keeps shared shell/workbench layout and Verdun no longer loads the Garbage frontend.
- Vite and generated Vercel routing use registered deploy profiles; Verdun's bundled default is the neutral demo at `/demo/`, while Garbage owns its `/rbage/` app and Vercel config under `apps/garbage/`.
- Vercel has `collected.ga` attached to the `garbage` project and aliased to the latest production deployment; `npm run check:deployed` is the public DNS/route check, while `npx vercel domains inspect collected.ga` and `npx vercel alias ls` verify Vercel-side domain state during DNS propagation.
- `npm run check:deployed -- --require-ready` verifies the deployed route, static snapshot, API snapshot, and publishing readiness criteria after editorial review.
- `npm run check:deployed -- --require-database` verifies the deployed API is backed by writable external database persistence rather than browser-local fallback.
- `npm run vercel:config` regenerates `vercel.json` from deploy profiles so app rewrites stay instance-owned rather than hand-coded in the root Vercel config.
- Deploy-check profile exports are neutral inside each instance module, and shared deployment tooling discovers `scripts/instances/*/deploy-checks.mjs` entries by convention instead of statically importing Garbage or Greathouse profiles.
- Garbage deploy-check profile metadata, wrapper, and hook implementations are parent-owned at `apps/garbage/scripts/deploy-checks.mjs`, `apps/garbage/scripts/check-deployed.mjs`, `apps/garbage/scripts/deployed-check-smoke-fixture.mjs`, and `apps/garbage/scripts/deployed-draft-checks.mjs`.
- Garbage deploy-check profile metadata also declares an external npm-workspace command runner for `@garbage/instance`, so shared Verdun orchestration runs Garbage commands through the package instead of local Verdun `garbage:*` scripts.
- Verdun external deploy-profile discovery is environment-driven through `VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES`; Garbage opts in from its parent-owned `check-deployed.mjs` wrapper through the `scripts/public/check-deployed.mjs` entrypoint.
- Vercel Authentication-protected deployments can be checked with `npx vercel curl /rbage/ --deployment <deployment-url>` and `npx vercel curl /api/garbage/newsletter/items --deployment <deployment-url>`.
- Deployed draft API and publishing-readiness validation is instance-owned: the generic deployed checker loads Garbage's validator from parent-owned `apps/garbage/scripts/deployed-draft-checks.mjs` through deploy-profile metadata.
- Inbox filtering by search text, vote state, project, source, and evidence stage so editors can prioritize live/manual collected items before watchlist seed placeholders.
- News cards expose labeled Include/Skip controls with pressed-state feedback, and `npm run smoke:browser` now includes a narrow-viewport clickability smoke for mobile-sized layouts.
- News cards use public HN-style upvote/downvote labels, credo-fit blurbs, and links into the maintained Strongly Typed AI ontology panel.
- News cards surface crawler provenance as editorial evidence from the API/static snapshot.
- News cards expose stable item anchors/permalinks and source domains for sharing and review.
- `apps/garbage/src/ontology.json` is the Garbage ontology source for the site and local Markdown drafts.
- Garbage publishing readiness checks in `apps/garbage/src/newsletter.ts` gate editorial picks, live source/project coverage, project spread, focus notes, source health, and snapshot freshness before Ulysses export.
- App and instance registration exports are neutral inside bundled instance modules, and the shared Verdun frontend registries discover bundled `app.ts` / `instance.ts` entries by convention without registering Garbage.
- Verdun smoke scripts validate Verdun's own bundled demo core and no longer read `../apps/garbage/*`; Garbage-specific crawler and browser-smoke ownership checks live in the parent Garbage verifier.
- Vercel API routes:
  - `GET /api/workbench/records?instance=demo`
  - `GET /api/workbench/status?instance=demo`
  - `GET /api/workbench/health?instance=demo`
  - `POST /api/workbench/review?instance=demo`
  - `POST /api/workbench/focus?instance=demo`
  - `POST /api/workbench/state?instance=demo`
  - `GET /api/garbage/newsletter/items`
  - `GET /api/garbage/newsletter/status`
  - `GET /api/garbage/newsletter/health`
  - `GET /api/garbage/newsletter/draft`
  - `POST /api/garbage/newsletter/vote`
  - `POST /api/garbage/newsletter/focus`
  - `POST /api/garbage/newsletter/editorial-state`
- Generic backend route helpers live internally in `api/core/http.ts` and are exposed to external apps through `api/public/http.ts`; Garbage data access and local fallback state live under parent-owned `apps/garbage/src/api/`.
- Generic local workbench adapter types are exposed externally through `api/public/workbench-local-adapter.ts`; Garbage fallback behavior is now an instance-owned registration rather than a Garbage-named adapter contract in the shared resolver.
- Bundled API fallback adapters are isolated in `api/instances/bundled-workbench-adapters.ts`, so the generic adapter registry does not directly import Garbage.
- The parent Garbage repo exposes `@garbage/instance` package commands as the stable app command surface. Publishing entrypoints, the newsletter draft builder, workbench projection, default publishing data, draft/URL-draft/readiness/source-gap/Ulysses/Ghost/public-snapshot/recency/API smoke coverage, browser smoke coverage, and Grust watchlist/dedupe/provenance/manual-source/query-plan crawler smoke commands now live in the parent package, import package TypeScript directly with Node, and no longer change cwd into Verdun. Local API smoke is parent-owned and loads app-owned route/store modules through the shared TypeScript migration loader.
- Grust watchlist audit and smoke scripts are parent-owned in `apps/garbage/scripts/`; Verdun reaches them through deploy-profile command metadata.
- Garbage crawler dedupe, provenance, query-plan, manual-source freshness, draft, URL draft, publishing-readiness, snapshot-recency, source-gap review, public snapshot coverage, and Ulysses export smokes are parent-owned app commands.
- Verdun's resident newsletter draft CLI and Ghost CLI/smoke paths have been removed from Verdun's package surface; local/draft/health API smokes run from the parent Garbage package against app-owned route modules.
- Legacy newsletter SQL apply/deploy helpers, loader smoke, newsletter snapshot/view smokes, and workbench compatibility smoke are parent-owned app commands. Some of those checks still intentionally load generic Verdun runtime helpers or API test-loader paths.
- Verdun's shared browser smoke orchestration runs Garbage app and responsive UI checks through the parent package command runner; the bundled Garbage UI and registration shim files have been removed.
- Garbage's API workbench adapter, newsletter store, and newsletter route handlers live under parent-owned `apps/garbage/src/api/`, with app-owned Vercel route files under `apps/garbage/api/garbage/newsletter/`.
- Garbage workbench adapter metadata is parent-owned at `apps/garbage/src/api/workbench.ts`; Verdun's bundled adapter manifest feeds only generic proof-instance fallback behavior.
- Garbage browser snapshot/view composables, app component, component files, style sheet, app entrypoint, and default-instance metadata are parent-owned; Verdun does not import them from its frontend registry.
- The duplicate resident newsletter, ontology, and snapshot-normalizer files have been removed; parent-owned Garbage modules are the source of truth.
- Generic Verdun workbench read routes live in `api/workbench/records.ts`, `api/workbench/status.ts`, and `api/workbench/health.ts`; their DB helper now requires an explicit `WorkbenchInstance` namespace while the public routes resolve defaults through the instance registry.
- `GET /api/garbage/newsletter/health` follows the Greathouse service-health pattern and reports database env state, read/write surfaces, guarded publishing surfaces, the Rust loader command, and active snapshot counts.
- Deployed no-database mode reports `editorialPersistence: "browser"` and stores votes/focus notes in browser-local state for export/import and Ulysses handoff; configured Postgres deployments report `database`, while local Garbage development without a database uses ignored `apps/garbage/data/editorial-state.json`.
- Static no-database Garbage API fallback reads the app-owned `GARBAGE_STATIC_SNAPSHOT_FILE`; Verdun-prefixed runtime names are bridge internals only when Garbage invokes Verdun public tooling.
- The app can import exported `{ votes, focuses }` editorial-state JSON into writable API modes, so a browser-local review session can be promoted into durable Postgres-backed state after the external database is configured.
- Generic database tables and views live in `db/migrations/0003_generic_workbench_tables.sql` (`instances`, `records`, `source_runs`, `collection_plans`, `review_state`, `focuses`) and are exposed to external apps through `db/public/workbench-migrations.mjs`.
- Garbage newsletter compatibility migrations live under parent-owned `apps/garbage/db/instances/garbage/migrations/` and are selected through the Garbage deploy profile when the current newsletter fallback tables are needed.
- Local no-database Garbage mode persists votes and focus notes to ignored `apps/garbage/data/editorial-state.json`, with `GARBAGE_LOCAL_STATE_FILE` available for tests or alternate local state.
- Rust crawler/loader scaffold under `crawler/`.
- Garbage crawler instance config, manual social imports, and Rust instance implementation live under parent-owned `apps/garbage/crawler/`, while reusable crawler structs are implemented internally in `crawler/src/core.rs` and exposed to app crates through `verdun_crawler::sdk`. Garbage registers its crawler from its own crate.
- Generic crawler instances now return `CrawlerCollection` from the shared trait. The shared CLI writes the core `CrawlerSnapshot` directly for generic reloads, Verdun's bundled demo emits core `NormalizedRecord` values directly, and app crates own any legacy item/public snapshot payloads.
- Rust crawler instance modules now expose neutral `CRAWLER_INSTANCE` registrations, so the shared crawler registry does not consume Garbage/Greathouse-named static exports.
- Resident Rust crawler modules are now listed in `crawler/src/instances/bundled.rs`, leaving the generic crawler resolver free of direct Garbage/Greathouse module references.
- Rust crawler output and editorial-state default paths now come from the selected crawler instance, so app crawlers do not fall back to shared `crawler/data/*` files.
- Verdun's bundled demo crawler adapters cover local record/diagnostic JSON, HTTP record/diagnostic JSON, and HTTP status diagnostics behind the same generic snapshot contract.
- Garbage static fallback data lives in `apps/garbage/data/newsletter-snapshot.json`, regenerated by the app-owned Rust crawler.
- Verdun no longer tracks Garbage crawler/newsletter seed artifacts under `crawler/data/` or `public/data/newsletter-snapshot.json`; those legacy paths are ignored in the core repo.
- Crawler items include normalized `raw_json.provenance` with source adapter, evidence URL, matched project, and matched keywords.
- Live/manual crawler items are deduplicated by canonical URL while retaining duplicate source evidence in `raw_json.duplicates`.
- External DB loader SQL exports to the reusable generic Verdun tables by default, while `export-sql --target newsletter` remains the explicit Garbage/newsletter compatibility path. Generic snapshot loading stays in the shared CLI; legacy Garbage newsletter snapshot and split-file payload loading is owned by the Garbage crawler instance. Both preserve the snapshot collection timestamp.
- `npm run db:apply` validates a generated generic workbench SQL load against its paired snapshot, applies the database migration, and loads external Postgres only when `--apply` and a database URL are present.
- `npm run db:deploy` regenerates or validates the generic workbench SQL load from the selected deploy profile, checks Vercel production database env before applying, loads external Postgres when `--apply` is present, and then runs the deployed `--require-database` gate.
- `npm run garbage:smoke:loader -- /tmp/garbage-newsletter-load.sql apps/garbage/data/newsletter-snapshot.json` checks that the legacy Garbage newsletter SQL export preserves required projects, source runs, query plans, tags, URLs, provenance JSON, and snapshot collection time before applying it to external Postgres.
- Database-backed API snapshots and status responses preserve the source collection timestamp from `newsletter_source_runs.collected_at`, so deployed draft issue dates follow the crawler/load run rather than serverless request time.
- Source-health metadata shown in the app sidebar, including per-project coverage for each watched source.
- Source-health coverage gaps use the crawler query plan as the watched-project authority, identify watched projects without live/manual source matches, show crawler query hints and source-specific review links for the first gaps, can be saved directly as this-week focus requests, and include the same actionable gap signal in local Markdown drafts.
- `npm run garbage:review:gaps` writes an ignored Markdown checklist of uncovered projects and their public/manual review targets for issue preparation.
- `verdun-crawler queries` and `collect` read exported/local editorial state when available and attach matching saved focus terms plus review targets for HN, Lobste.rs, dev.to, Medium, Substack, LinkedIn, and X/Twitter to project query plans.
- Live public-source ingestion for Hacker News, Lobste.rs, project-tagged dev.to queries, configured Medium/Substack feeds, and manual LinkedIn/X JSON imports, merged with the curated watchlist for Pydantic, BAML, DSPy, Instructor, LakeSail, Apache Arrow, DataFusion, Delta Lake, Ibis, Dagster, Grust Sail, Turso, LanceDB, HelixDB, SurrealDB, pgGraph, Grust, TypeSec, Garde, zod-rs, FalkorDB, LadybugDB, and CocoIndex.
- Feed ingestion matches descriptions, summaries, and encoded long-form content with term-boundary checks, so Substack/RSS items can be found without turning short names such as Garde into substring false positives.
- Manual LinkedIn/X imports now report reviewed-post freshness and mark the source run as an error when the newest manual post is outside the active collection window, feeding the same source-health readiness gate as network source failures.
- `verdun-crawler queries` prints generic `NormalizedCollectionPlan` JSON for watched subjects before a live collection run.
- Live/manual collection defaults to a 45-day recency window via `--since-days`, so weekly drafts do not pull stale search hits.
- `verdun-crawler verify` guards the required project list, public-source adapters, Medium/Substack feed configuration, and LinkedIn/X manual import files.
- Deterministic local Markdown draft generation in the app and from `npm run garbage:draft` / `npm run garbage:ulysses:draft`, including saved this-week and ongoing focus notes as an editorial brief.
- Draft generation now opens with a weekly throughline that synthesizes selected projects by ontology, source evidence, topic, and saved editorial intent before the item list.
- Draft item sections and publish manifests include selection reasons so upvotes, live/manual evidence, and fallback ranking are auditable.
- Draft item sections include source-linked provenance evidence lines when crawler/API evidence is available.
- Publish manifests include deterministic prose-quality checks for weekly throughline/arc, crawler/feed boilerplate leaks, per-selected-item source-linked evidence, source links, credo fit, and selection audit; `--require-ready` now blocks Ulysses/Ghost-ready exports when those prose checks fail.
- Fallback draft selection prefers live/manual collected items over watchlist seed placeholders and keeps project diversity unless the editor explicitly upvotes different items.
- Draft rendering normalizes thin feed snippets, generic feed captions, and crawler boilerplate into fuller source-aware/project-aware prose before Markdown/Ghost output.
- Local draft generation overlays ignored `apps/garbage/data/editorial-state.json` so no-database app upvotes/focus notes drive the Ulysses and Ghost draft paths; `NEWSLETTER_APPLY_LOCAL_STATE=false` renders the raw snapshot.
- Draft and Ghost scripts can read a snapshot from a local JSON file or an `http(s)` URL, including the deployed `/api/garbage/newsletter/items` endpoint.
- Draft and Ghost scripts support `--require-upvotes` / `NEWSLETTER_REQUIRE_UPVOTES=true` to block publishing from a fallback-ranked draft when no item has been explicitly upvoted.
- Draft and Ghost scripts support `--require-ready` / `NEWSLETTER_REQUIRE_READY=true` to apply the same publishing readiness checks used by the app before writing or posting a draft.
- The Garbage app preview, local Markdown export, and optional Ghost helper share the same draft builder in `apps/garbage/src/newsletter.ts`.
- The app draft preview offers direct Markdown download/copy controls for the exact draft shown on screen.
- The app draft preview imports and exports `{ votes, focuses }` editorial state JSON in the same shape consumed by `GARBAGE_LOCAL_STATE_FILE` for local Ulysses export.
- The app draft preview exports the same publish manifest shape used by the CLI, so browser triage can audit selected item IDs, votes, focuses, readiness, coverage, and source/query-plan counts before local export.
- Publish manifests and the draft preview summarize the selected spine's evidence mix by live/manual/seed counts and source mix before Ulysses or Ghost handoff.
- `npm run garbage:ulysses:ready` gates local Ulysses Markdown export on explicit upvotes and publishing readiness, failing until local editorial state is ready.
- `npm run garbage:ulysses:draft` writes a dated Markdown export under ignored `apps/garbage/data/ulysses/` in the parent Garbage package by default, or to `ULYSSES_DRAFT_DIR` / `NEWSLETTER_DRAFT_OUT` when set.
- `npm run garbage:ulysses:ready -- --editorial-state /path/to/exported-state.json` uses a downloaded app editorial-state file directly and records it in the paired manifest as `editorialStateInput`.
- `ULYSSES_IMPORT_DIR` or `--ulysses-import-dir` copies the generated Markdown and paired manifest into an external Ulysses handoff folder after a successful export.
- File-based draft exports also write a same-stem `.manifest.json` with issue identity metadata, the snapshot input, publishing gates, selected item IDs, selected item metadata, votes, focuses, readiness checks, source coverage, source runs, and query-plan count.
- Optional Ghost Admin API draft helper remains available, but the primary publishing path is local Markdown into Ulysses rather than drafting from Vercel.
- `npm run garbage:ghost:draft -- --editorial-state /path/to/exported-state.json` applies the same browser-exported votes and focus notes as `npm run garbage:ulysses:ready` and records the file in the Ghost audit manifest.
- `npm run garbage:ghost:dry-run -- --editorial-state /path/to/exported-state.json` validates the Ghost endpoint/payload/manifest shape, including deterministic slug and metadata fields, without credentials or network access; `--manifest-out` / `GHOST_MANIFEST_OUT` writes the same audit bundle to disk.
- Real Ghost API writes require `--require-upvotes` and `--require-ready` by default; `npm run garbage:ghost:ready` is the guarded command, while non-draft Ghost statuses and ungated writes require explicit override flags.

## Next Work

- Keep Garbage-specific crawler, SQL compatibility, route/discovery, deployment, and runtime integration behavior app-owned behind explicit Garbage instance namespaces.
- Reduce migration-era smoke and helper names now that Verdun no longer carries resident Garbage or Greathouse implementations.
- Continue hardening crawler and deploy-profile registration as reusable app/plugin contracts rather than local workspace conventions.
- Harden `verdun-crawler` publication metadata and keep app crawler registration paths package-owned for Garbage, Greathouse, and future consumers.
- Replace manual LinkedIn/X imports with authenticated or policy-aware Garbage adapters when credentials and platform policy are settled.

## Verification

Current local checks:

- `npm run smoke:demo-workbench`
- `npm run smoke:all`
- `npm run smoke:browser`
- `npm run garbage:smoke:ulysses`
- `npm run prod:build`
- `npm run check:deployed`
- `npm run check:preview`
- `cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- collect --live --max-live-per-project 2`
- `cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- queries`
- `npm run garbage:draft`
- `npm run garbage:smoke:app -- http://127.0.0.1:5174/rbage/`
