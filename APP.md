# Verdun App State

## Goal

Build a newsletter generator for strongly typed and functional AI/data news. The deployed Vercel app should run at `collected.ga/rbage/`, show candidate news items, allow upvote/downvote editorial triage, and accept text requests for what to collect more of. The publishing sequence is a local Markdown draft for editing/publishing with Ulysses.

## Current Slice

- Verdun is now being extracted as the reusable core; the live newsletter app is the Garbage instance layered on top of it.
- Generic workbench contracts live in `src/core/workbench.ts`, while Garbage instance configuration and ontology data live under `src/instances/garbage/`.
- Vue/Vite app with a newsroom triage interface.
- Greathouse-style dashboard components extracted under `src/components/`, including `AppHeader.vue`, `EditorialSidebar.vue`, `InboxControls.vue`, `NewsletterDraftPreview.vue`, `NewsletterHero.vue`, `SourceHealthPanel.vue`, and `NewsItemCard.vue`, so shared shell/editorial/inbox/draft/hero/source-health/item-card UI can be generalized later.
- Frontend snapshot loading plus optimistic vote/focus persistence live in `src/composables/useNewsletterSnapshot.ts`; filtering, counts, draft state, and readiness derivation live in `src/composables/useNewsletterView.ts`, leaving `App.vue` as component composition.
- Vite/Vercel configured for the `/rbage/` public path.
- Vercel has `collected.ga` attached to the `garbage` project and aliased to the latest production deployment; `npm run check:deployed` is the public DNS/route check, while `npx vercel domains inspect collected.ga` and `npx vercel alias ls` verify Vercel-side domain state during DNS propagation.
- `npm run check:deployed -- --require-ready` verifies the deployed route, static snapshot, API snapshot, and publishing readiness criteria after editorial review.
- `npm run check:deployed -- --require-database` verifies the deployed API is backed by writable external database persistence rather than browser-local fallback.
- Vercel Authentication-protected deployments can be checked with `npx vercel curl /rbage/ --deployment <deployment-url>` and `npx vercel curl /api/newsletter/items --deployment <deployment-url>`.
- Inbox filtering by search text, vote state, project, source, and evidence stage so editors can prioritize live/manual collected items before watchlist seed placeholders.
- News cards expose labeled Include/Skip controls with pressed-state feedback, and `npm run smoke:browser` now includes a narrow-viewport clickability smoke for mobile-sized layouts.
- News cards use public HN-style upvote/downvote labels, credo-fit blurbs, and links into the maintained Strongly Typed AI ontology panel.
- News cards surface crawler provenance as editorial evidence from the API/static snapshot.
- News cards expose stable item anchors/permalinks and source domains for sharing and review.
- `src/instances/garbage/ontology.json` is the Garbage ontology source for the site and local Markdown drafts.
- Shared publishing readiness checks in `src/lib/newsletter.ts` now gate editorial picks, live source/project coverage, project spread, focus notes, source health, and snapshot freshness before Ulysses export.
- Vercel API routes:
  - `GET /api/newsletter/items`
  - `GET /api/newsletter/status`
  - `GET /api/newsletter/health`
  - `GET /api/newsletter/draft`
  - `POST /api/newsletter/vote`
  - `POST /api/newsletter/focus`
  - `POST /api/newsletter/editorial-state`
- Backend route helpers live in `api/newsletter/_http.ts`, leaving `api/newsletter/_db.ts` as the persistence adapter.
- Generic Verdun workbench read routes live in `api/workbench/records.ts`, `api/workbench/status.ts`, and `api/workbench/health.ts`, projected from the current Garbage instance.
- `GET /api/newsletter/health` follows the Greathouse service-health pattern and reports database env state, read/write surfaces, guarded publishing surfaces, the Rust loader command, and active snapshot counts.
- Deployed no-database mode reports `editorialPersistence: "browser"` and stores votes/focus notes in browser-local state for export/import and Ulysses handoff; configured Postgres deployments report `database`, while local development without a database uses ignored `crawler/data/editorial-state.json`.
- The app can import exported `{ votes, focuses }` editorial-state JSON into writable API modes, so a browser-local review session can be promoted into durable Postgres-backed state after the external database is configured.
- External Postgres schema in `db/migrations/0001_newsletter.sql`.
- Generic `workbench_*` database views in `db/migrations/0002_workbench_views.sql`, projected over the current Garbage/newsletter tables for reuse.
- Local no-database mode persists votes and focus notes to ignored `crawler/data/editorial-state.json`, with `VERDUN_LOCAL_STATE_FILE` available for tests or alternate local state.
- Rust crawler/loader scaffold under `crawler/`.
- Garbage crawler instance config and manual social imports live under `crawler/instances/garbage/`; reusable crawler structs live in `crawler/src/core.rs`.
- Static fallback data in `public/data/newsletter-snapshot.json`, regenerated by the Rust crawler.
- Crawler items include normalized `raw_json.provenance` with source adapter, evidence URL, matched project, and matched keywords.
- Live/manual crawler items are deduplicated by canonical URL while retaining duplicate source evidence in `raw_json.duplicates`.
- External DB loader SQL can export from the cohesive public snapshot and upserts newsletter items, `newsletter_source_runs`, and `newsletter_query_plans` while preserving the snapshot collection timestamp.
- `npm run db:apply` validates a generated SQL load against its paired snapshot, applies the database migration, and loads external Postgres only when `--apply` and a database URL are present.
- `npm run db:deploy` regenerates or validates the SQL load, checks Vercel production database env before applying, loads external Postgres when `--apply` is present, and then runs the deployed `--require-database` gate.
- `npm run smoke:loader -- /tmp/verdun-newsletter-load.sql public/data/newsletter-snapshot.json` checks that the SQL export preserves required projects, source runs, query plans, tags, URLs, provenance JSON, and snapshot collection time before applying it to external Postgres.
- Database-backed API snapshots and status responses preserve the source collection timestamp from `newsletter_source_runs.collected_at`, so deployed draft issue dates follow the crawler/load run rather than serverless request time.
- Source-health metadata shown in the app sidebar, including per-project coverage for each watched source.
- Source-health coverage gaps use the crawler query plan as the watched-project authority, identify watched projects without live/manual source matches, show crawler query hints and source-specific review links for the first gaps, can be saved directly as this-week focus requests, and include the same actionable gap signal in local Markdown drafts.
- `npm run review:gaps` writes an ignored Markdown checklist of uncovered projects and their public/manual review targets for issue preparation.
- `verdun-crawler queries` and `collect` read exported/local editorial state when available and attach matching saved focus terms plus review targets for HN, Lobste.rs, dev.to, Medium, Substack, LinkedIn, and X/Twitter to project query plans.
- Live public-source ingestion for Hacker News, Lobste.rs, project-tagged dev.to queries, configured Medium/Substack feeds, and manual LinkedIn/X JSON imports, merged with the curated watchlist for Pydantic, BAML, DSPy, Instructor, LakeSail, Apache Arrow, DataFusion, Delta Lake, Ibis, Dagster, Grust Sail, Turso, LanceDB, HelixDB, SurrealDB, pgGraph, Grust, TypeSec, Garde, zod-rs, FalkorDB, LadybugDB, and CocoIndex.
- Feed ingestion matches descriptions, summaries, and encoded long-form content with term-boundary checks, so Substack/RSS items can be found without turning short names such as Garde into substring false positives.
- Manual LinkedIn/X imports now report reviewed-post freshness and mark the source run as an error when the newest manual post is outside the active collection window, feeding the same source-health readiness gate as network source failures.
- `verdun-crawler queries` prints the non-network query plan for watched projects before a live collection run.
- Live/manual collection defaults to a 45-day recency window via `--since-days`, so weekly drafts do not pull stale search hits.
- `verdun-crawler verify` guards the required project list, public-source adapters, Medium/Substack feed configuration, and LinkedIn/X manual import files.
- Deterministic local Markdown draft generation in the app and from `npm run draft` / `npm run ulysses:draft`, including saved this-week and ongoing focus notes as an editorial brief.
- Draft generation now opens with a weekly throughline that synthesizes selected projects by ontology, source evidence, topic, and saved editorial intent before the item list.
- Draft item sections and publish manifests include selection reasons so upvotes, live/manual evidence, and fallback ranking are auditable.
- Draft item sections include source-linked provenance evidence lines when crawler/API evidence is available.
- Publish manifests include deterministic prose-quality checks for weekly throughline/arc, crawler/feed boilerplate leaks, per-selected-item source-linked evidence, source links, credo fit, and selection audit; `--require-ready` now blocks Ulysses/Ghost-ready exports when those prose checks fail.
- Fallback draft selection prefers live/manual collected items over watchlist seed placeholders and keeps project diversity unless the editor explicitly upvotes different items.
- Draft rendering normalizes thin feed snippets, generic feed captions, and crawler boilerplate into fuller source-aware/project-aware prose before Markdown/Ghost output.
- Local draft generation overlays ignored `crawler/data/editorial-state.json` so no-database app upvotes/focus notes drive the Ulysses and Ghost draft paths; `NEWSLETTER_APPLY_LOCAL_STATE=false` renders the raw snapshot.
- Draft and Ghost scripts can read a snapshot from a local JSON file or an `http(s)` URL, including the deployed `/api/newsletter/items` endpoint.
- Draft and Ghost scripts support `--require-upvotes` / `NEWSLETTER_REQUIRE_UPVOTES=true` to block publishing from a fallback-ranked draft when no item has been explicitly upvoted.
- Draft and Ghost scripts support `--require-ready` / `NEWSLETTER_REQUIRE_READY=true` to apply the same publishing readiness checks used by the app before writing or posting a draft.
- The app preview, local Markdown export, and optional Ghost helper share the same draft builder in `src/lib/newsletter.ts`.
- The app draft preview offers direct Markdown download/copy controls for the exact draft shown on screen.
- The app draft preview imports and exports `{ votes, focuses }` editorial state JSON in the same shape consumed by `VERDUN_LOCAL_STATE_FILE` for local Ulysses export.
- The app draft preview exports the same publish manifest shape used by the CLI, so browser triage can audit selected item IDs, votes, focuses, readiness, coverage, and source/query-plan counts before local export.
- Publish manifests and the draft preview summarize the selected spine's evidence mix by live/manual/seed counts and source mix before Ulysses or Ghost handoff.
- `npm run ulysses:ready` gates local Ulysses Markdown export on explicit upvotes and publishing readiness, failing until local editorial state is ready.
- `npm run ulysses:draft` writes a dated Markdown export under ignored `crawler/data/ulysses/` by default, or to `ULYSSES_DRAFT_DIR` / `NEWSLETTER_DRAFT_OUT` when set.
- `npm run ulysses:ready -- --editorial-state /path/to/exported-state.json` uses a downloaded app editorial-state file directly and records it in the paired manifest as `editorialStateInput`.
- `ULYSSES_IMPORT_DIR` or `--ulysses-import-dir` copies the generated Markdown and paired manifest into an external Ulysses handoff folder after a successful export.
- File-based draft exports also write a same-stem `.manifest.json` with issue identity metadata, the snapshot input, publishing gates, selected item IDs, selected item metadata, votes, focuses, readiness checks, source coverage, source runs, and query-plan count.
- Optional Ghost Admin API draft helper remains available, but the primary publishing path is local Markdown into Ulysses rather than drafting from Vercel.
- `npm run ghost:draft -- --editorial-state /path/to/exported-state.json` applies the same browser-exported votes and focus notes as `npm run ulysses:ready` and records the file in the Ghost audit manifest.
- `npm run ghost:dry-run -- --editorial-state /path/to/exported-state.json` validates the Ghost endpoint/payload/manifest shape, including deterministic slug and metadata fields, without credentials or network access; `--manifest-out` / `GHOST_MANIFEST_OUT` writes the same audit bundle to disk.
- Real Ghost API writes require `--require-upvotes` and `--require-ready` by default; `npm run ghost:ready` is the guarded command, while non-draft Ghost statuses and ungated writes require explicit override flags.

## Next Work

- Replace manual LinkedIn/X imports with authenticated or policy-aware adapters when credentials and platform policy are settled.
- Extract shared UI/API/crawler modules back into Greathouse after the Verdun shape stabilizes.

## Verification

Current local checks:

- `npm run smoke:all`
- `npm run smoke:browser`
- `npm run smoke:ulysses`
- `npm run prod:build`
- `npm run check:deployed`
- `npm run check:preview`
- `cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2`
- `cargo run --manifest-path crawler/Cargo.toml -- queries`
- `npm run draft`
- `npm run smoke:app -- http://127.0.0.1:5174/rbage/`
