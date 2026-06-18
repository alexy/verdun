# Verdun App State

## Goal

Extract Verdun into a reusable Vercel plus database workbench core filled by external Rust crawlers. Garbage is the current Strongly Typed AI/newsletter instance running at `collected.ga/rbage/`; it shows candidate news items, supports editorial upvote/downvote triage, accepts collection-focus requests, and exports local Markdown for editing/publishing with Ulysses.

## Current Slice

- Verdun is now being extracted as the reusable core; the live newsletter app is the Garbage instance layered on top of it.
- Generic workbench contracts live in `src/core/workbench.ts`, while Garbage instance configuration and ontology data live under `src/instances/garbage/`.
- A Greathouse pilot under `src/instances/greathouse/` uses the same workbench contract for property listing and blocked-source diagnostic records.
- Vue/Vite app with a newsroom triage interface.
- Reusable workbench controls now live under `src/components/workbench/`; Garbage-specific editorial, inbox, draft, source-health, and news-card UI lives under `src/instances/garbage/components/`.
- Generic frontend filtering/count/coverage logic lives in `src/composables/useWorkbenchView.ts`; Garbage-specific snapshot loading, optimistic vote/focus persistence, draft state, and readiness derivation live under `src/instances/garbage/composables/`.
- Garbage-specific newsletter, publishing, ontology, and source-gap styles live in `src/instances/garbage/style.css`; root `src/style.css` now keeps shared shell/workbench layout.
- Vite and generated Vercel routing use registered deploy profiles; Garbage remains the default `/rbage/` public path and Greathouse is routable at `/greathouse/`.
- Vercel has `collected.ga` attached to the `garbage` project and aliased to the latest production deployment; `npm run check:deployed` is the public DNS/route check, while `npx vercel domains inspect collected.ga` and `npx vercel alias ls` verify Vercel-side domain state during DNS propagation.
- `npm run check:deployed -- --require-ready` verifies the deployed route, static snapshot, API snapshot, and publishing readiness criteria after editorial review.
- `npm run check:deployed -- --require-database` verifies the deployed API is backed by writable external database persistence rather than browser-local fallback.
- `npm run vercel:config` regenerates `vercel.json` from deploy profiles so app rewrites stay instance-owned rather than hand-coded in the root Vercel config.
- Deploy-check profile exports are neutral inside each instance module, and shared deployment tooling discovers `scripts/instances/*/deploy-checks.mjs` entries by convention instead of statically importing Garbage or Greathouse profiles.
- Vercel Authentication-protected deployments can be checked with `npx vercel curl /rbage/ --deployment <deployment-url>` and `npx vercel curl /api/garbage/newsletter/items --deployment <deployment-url>`.
- Deployed draft API and publishing-readiness validation is instance-owned: the generic deployed checker loads Garbage's validator from `scripts/instances/garbage/deployed-draft-checks.mjs` through deploy-profile metadata.
- Inbox filtering by search text, vote state, project, source, and evidence stage so editors can prioritize live/manual collected items before watchlist seed placeholders.
- News cards expose labeled Include/Skip controls with pressed-state feedback, and `npm run smoke:browser` now includes a narrow-viewport clickability smoke for mobile-sized layouts.
- News cards use public HN-style upvote/downvote labels, credo-fit blurbs, and links into the maintained Strongly Typed AI ontology panel.
- News cards surface crawler provenance as editorial evidence from the API/static snapshot.
- News cards expose stable item anchors/permalinks and source domains for sharing and review.
- `src/instances/garbage/ontology.json` is the Garbage ontology source for the site and local Markdown drafts.
- Garbage publishing readiness checks in `src/instances/garbage/newsletter.ts` now gate editorial picks, live source/project coverage, project spread, focus notes, source health, and snapshot freshness before Ulysses export.
- App and instance registration exports are neutral inside each instance module, and the shared frontend registries discover `app.ts` and `instance.ts` entries by convention instead of statically importing Garbage or Greathouse.
- Vercel API routes:
  - `GET /api/workbench/records?instance=garbage|greathouse`
  - `GET /api/workbench/status?instance=garbage|greathouse`
  - `GET /api/workbench/health?instance=garbage|greathouse`
  - `POST /api/workbench/review?instance=garbage|greathouse`
  - `POST /api/workbench/focus?instance=garbage|greathouse`
  - `POST /api/workbench/state?instance=garbage|greathouse`
  - `GET /api/garbage/newsletter/items`
  - `GET /api/garbage/newsletter/status`
  - `GET /api/garbage/newsletter/health`
  - `GET /api/garbage/newsletter/draft`
  - `POST /api/garbage/newsletter/vote`
  - `POST /api/garbage/newsletter/focus`
  - `POST /api/garbage/newsletter/editorial-state`
- Generic backend route helpers live in `api/core/http.ts`, while Garbage data access and local fallback state live under `api/instances/garbage/`.
- Generic local workbench adapter types live in `api/workbench/local-adapter-types.ts`; Garbage fallback behavior is now an instance-owned registration rather than a Garbage-named adapter contract in the shared resolver.
- Bundled API fallback adapters are isolated in `api/instances/bundled-workbench-adapters.ts`, so the generic adapter registry does not directly import Garbage.
- The parent Garbage repo now exposes `@garbage/instance` package commands as the temporary stable command surface while Garbage implementation moves out of Verdun. Publishing entrypoints, the newsletter draft builder, default publishing data, source-gap/Ulysses smoke coverage, and Grust watchlist audit commands now live in the parent package, import package TypeScript directly with Node, and no longer change cwd into Verdun; operational compatibility smokes still delegate through the external instance manifest into declared Verdun scripts.
- Generic Verdun workbench read routes live in `api/workbench/records.ts`, `api/workbench/status.ts`, and `api/workbench/health.ts`; their DB helper now requires an explicit `WorkbenchInstance` namespace while the public routes resolve defaults through the instance registry.
- `GET /api/garbage/newsletter/health` follows the Greathouse service-health pattern and reports database env state, read/write surfaces, guarded publishing surfaces, the Rust loader command, and active snapshot counts.
- Deployed no-database mode reports `editorialPersistence: "browser"` and stores votes/focus notes in browser-local state for export/import and Ulysses handoff; configured Postgres deployments report `database`, while local development without a database uses ignored `crawler/data/editorial-state.json`.
- The app can import exported `{ votes, focuses }` editorial-state JSON into writable API modes, so a browser-local review session can be promoted into durable Postgres-backed state after the external database is configured.
- Generic database tables and views live in `db/migrations/0003_generic_workbench_tables.sql` (`instances`, `records`, `source_runs`, `collection_plans`, `review_state`, `focuses`).
- Garbage newsletter compatibility migrations live under `db/instances/garbage/migrations/` and are selected through the Garbage deploy profile when the current newsletter fallback tables are needed.
- Local no-database mode persists votes and focus notes to ignored `crawler/data/editorial-state.json`, with `VERDUN_LOCAL_STATE_FILE` available for tests or alternate local state.
- Rust crawler/loader scaffold under `crawler/`.
- Garbage crawler instance config lives at `crawler/instances/garbage/config.toml`, manual social imports live under `crawler/instances/garbage/manual/`, and reusable crawler structs live in `crawler/src/core.rs`.
- Generic crawler instances now return `CrawlerCollection` from the shared trait. The shared CLI writes the core `CrawlerSnapshot` directly for generic reloads, Greathouse adapters emit core `NormalizedRecord` values directly, and Garbage owns its legacy newsletter item/public snapshot payloads.
- Rust crawler instance modules now expose neutral `CRAWLER_INSTANCE` registrations, so the shared crawler registry does not consume Garbage/Greathouse-named static exports.
- Resident Rust crawler modules are now listed in `crawler/src/instances/bundled.rs`, leaving the generic crawler resolver free of direct Garbage/Greathouse module references.
- Rust crawler output and editorial-state default paths now come from the selected crawler instance, so Greathouse no longer falls back to Garbage's `crawler/data/*` files.
- Greathouse crawler adapters now cover local listing/diagnostic JSON, HTTP listing/diagnostic JSON, HTTP status diagnostics, browser diagnostics, Redfin-shaped listings, and Zillow-shaped listings behind the same generic snapshot contract.
- Static fallback data in `public/data/newsletter-snapshot.json`, regenerated by the Rust crawler.
- Crawler items include normalized `raw_json.provenance` with source adapter, evidence URL, matched project, and matched keywords.
- Live/manual crawler items are deduplicated by canonical URL while retaining duplicate source evidence in `raw_json.duplicates`.
- External DB loader SQL exports to the reusable generic Verdun tables by default, while `export-sql --target newsletter` remains the explicit Garbage/newsletter compatibility path. Generic snapshot loading stays in the shared CLI; legacy Garbage newsletter snapshot and split-file payload loading is owned by the Garbage crawler instance. Both preserve the snapshot collection timestamp.
- `npm run db:apply` validates a generated generic workbench SQL load against its paired snapshot, applies the database migration, and loads external Postgres only when `--apply` and a database URL are present.
- `npm run db:deploy` regenerates or validates the generic workbench SQL load from the selected deploy profile, checks Vercel production database env before applying, loads external Postgres when `--apply` is present, and then runs the deployed `--require-database` gate.
- `npm run garbage:smoke:loader -- /tmp/verdun-newsletter-load.sql public/data/newsletter-snapshot.json` checks that the legacy Garbage newsletter SQL export preserves required projects, source runs, query plans, tags, URLs, provenance JSON, and snapshot collection time before applying it to external Postgres.
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
- Local draft generation overlays ignored `crawler/data/editorial-state.json` so no-database app upvotes/focus notes drive the Ulysses and Ghost draft paths; `NEWSLETTER_APPLY_LOCAL_STATE=false` renders the raw snapshot.
- Draft and Ghost scripts can read a snapshot from a local JSON file or an `http(s)` URL, including the deployed `/api/garbage/newsletter/items` endpoint.
- Draft and Ghost scripts support `--require-upvotes` / `NEWSLETTER_REQUIRE_UPVOTES=true` to block publishing from a fallback-ranked draft when no item has been explicitly upvoted.
- Draft and Ghost scripts support `--require-ready` / `NEWSLETTER_REQUIRE_READY=true` to apply the same publishing readiness checks used by the app before writing or posting a draft.
- The Garbage app preview, local Markdown export, and optional Ghost helper share the same draft builder in `src/instances/garbage/newsletter.ts`.
- The app draft preview offers direct Markdown download/copy controls for the exact draft shown on screen.
- The app draft preview imports and exports `{ votes, focuses }` editorial state JSON in the same shape consumed by `VERDUN_LOCAL_STATE_FILE` for local Ulysses export.
- The app draft preview exports the same publish manifest shape used by the CLI, so browser triage can audit selected item IDs, votes, focuses, readiness, coverage, and source/query-plan counts before local export.
- Publish manifests and the draft preview summarize the selected spine's evidence mix by live/manual/seed counts and source mix before Ulysses or Ghost handoff.
- `npm run garbage:ulysses:ready` gates local Ulysses Markdown export on explicit upvotes and publishing readiness, failing until local editorial state is ready.
- `npm run garbage:ulysses:draft` writes a dated Markdown export under ignored `crawler/data/ulysses/` by default, or to `ULYSSES_DRAFT_DIR` / `NEWSLETTER_DRAFT_OUT` when set.
- `npm run garbage:ulysses:ready -- --editorial-state /path/to/exported-state.json` uses a downloaded app editorial-state file directly and records it in the paired manifest as `editorialStateInput`.
- `ULYSSES_IMPORT_DIR` or `--ulysses-import-dir` copies the generated Markdown and paired manifest into an external Ulysses handoff folder after a successful export.
- File-based draft exports also write a same-stem `.manifest.json` with issue identity metadata, the snapshot input, publishing gates, selected item IDs, selected item metadata, votes, focuses, readiness checks, source coverage, source runs, and query-plan count.
- Optional Ghost Admin API draft helper remains available, but the primary publishing path is local Markdown into Ulysses rather than drafting from Vercel.
- `npm run garbage:ghost:draft -- --editorial-state /path/to/exported-state.json` applies the same browser-exported votes and focus notes as `npm run garbage:ulysses:ready` and records the file in the Ghost audit manifest.
- `npm run garbage:ghost:dry-run -- --editorial-state /path/to/exported-state.json` validates the Ghost endpoint/payload/manifest shape, including deterministic slug and metadata fields, without credentials or network access; `--manifest-out` / `GHOST_MANIFEST_OUT` writes the same audit bundle to disk.
- Real Ghost API writes require `--require-upvotes` and `--require-ready` by default; `npm run garbage:ghost:ready` is the guarded command, while non-draft Ghost statuses and ungated writes require explicit override flags.

## Next Work

- Keep moving Garbage-specific app, publishing, and compatibility behavior behind explicit Garbage instance namespaces until shared Verdun files stop embedding newsletter or Strongly Typed AI assumptions.
- Replace the parent Garbage package's remaining explicit legacy Verdun path compatibility after the crawler/output boundary moves.
- Continue turning Greathouse into an external consumer proof of the same core rather than merely a resident pilot.
- Replace manual LinkedIn/X imports with authenticated or policy-aware Garbage adapters when credentials and platform policy are settled.

## Verification

Current local checks:

- `npm run smoke:all`
- `npm run smoke:browser`
- `npm run garbage:smoke:ulysses`
- `npm run prod:build`
- `npm run check:deployed`
- `npm run check:preview`
- `cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2`
- `cargo run --manifest-path crawler/Cargo.toml -- queries`
- `npm run garbage:draft`
- `npm run garbage:smoke:app -- http://127.0.0.1:5174/rbage/`
