# Verdun

Verdun is being extracted into the reusable core for database-backed collection/review workbenches. The current checked-in instance is Garbage: the editorial desk for `collected.ga/rbage/`, with a Vercel/Vue app plus a Rust crawler/loader for weekly strongly typed and functional AI/data news.

The first reusable boundary is now explicit:

- Generic workbench contracts live in `src/core/workbench.ts`.
- Garbage instance configuration lives in `src/instances/garbage/config.ts`.
- Garbage-specific ontology data lives in `src/instances/garbage/ontology.json`.
- Generic `workbench_*` database views live in `db/migrations/0002_workbench_views.sql` over the current newsletter tables.
- Existing newsletter routes, scripts, and database tables still use their current names while the boundary is extracted incrementally.

The first slice mirrors the useful Greathouse shape without touching Greathouse:

- Vue/Vite app deployed by Vercel.
- Vite is built with `/rbage/` as the public base path for `collected.ga/rbage/`.
- Vercel serverless API routes reading an external Postgres database.
- Rust crawler/loader crate that collects watchlist items and exports SQL for the database.
- Grust watchlist audit that checks Verdun still tracks the backend and typed-validation projects surfaced by the local `/Users/alexy/src/grust` workspace.
- Crawler output keeps normalized provenance inside each item's `raw_json`, including source adapter, evidence URL, matched project, and matched keywords.
- Crawler output deduplicates live/manual items by canonical URL, preferring stronger reviewed evidence while retaining duplicate source records in `raw_json.duplicates`.
- Editorial/public UI for upvoting/downvoting news items and writing this-week or ongoing focus requests.
- Public item cards show HN-style voting plus Strongly Typed AI credo blurbs linked to the maintained ontology panel.
- Public item cards surface crawler provenance as editorial evidence, including the adapter/stage that brought each item into the queue.
- Item cards use labeled Include/Skip controls with pressed-state feedback so browser-local editorial votes are visibly actionable on desktop and mobile-sized layouts.
- Inbox filters can isolate live/manual collected evidence from watchlist seed placeholders for faster publish review.
- `GET /api/newsletter/draft` exposes the same generated draft as JSON, Markdown, HTML, or publish manifest for local automation and audit.
- `GET /api/newsletter/health` exposes the Greathouse-style service health surface: database env state, read/write routes, guarded publishing commands, loader expectations, and active snapshot counts.
- Publish manifests and the draft preview summarize selected evidence by live/manual/seed counts and source mix before Ulysses or Ghost handoff.
- Publishing readiness checks show whether the queue has explicit editorial picks, live source/project coverage, project spread, saved focus, healthy watched sources, and a fresh collection snapshot before local Ulysses export.
- Source health calls out watched projects from the crawler query plan that lack live/manual source coverage, shows crawler query hints and source-specific review links for those gaps, and lets the editor save a this-week collection request from a gap with one click.
- The maintained Garbage ontology lives in `src/instances/garbage/ontology.json` and is reused by the app and local Markdown draft generation.
- The first Greathouse-style reusable Vue pieces live in `src/components/`: `AppHeader.vue`, `EditorialSidebar.vue`, `InboxControls.vue`, `NewsletterDraftPreview.vue`, `NewsletterHero.vue`, `SourceHealthPanel.vue`, and `NewsItemCard.vue`.
- Frontend snapshot loading and optimistic vote/focus persistence live in `src/composables/useNewsletterSnapshot.ts`, while filtering, counts, draft state, and readiness derivation live in `src/composables/useNewsletterView.ts`.
- Backend route mechanics live in `api/newsletter/_http.ts`, while data access and local fallback state stay in `api/newsletter/_db.ts`, matching the Greathouse-style reusable backend boundary.
- The app's editorial-state import posts `{ votes, focuses }` to `POST /api/newsletter/editorial-state` when the API is writable, so browser-local review work can be promoted into durable Postgres state after external database setup.

## Local app

```sh
npm install
npm run dev:app
```

Open `http://127.0.0.1:5176`.

Without `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`, the API uses the checked-in static crawler snapshot. On Vercel this is a read-only API snapshot, so the app reports `Browser-local edits` and persists votes/focus notes to browser storage for refresh-safe review, editorial-state export/import, and Ulysses handoff. In local development without a database, votes and focus notes are persisted to ignored `crawler/data/editorial-state.json`; set `VERDUN_LOCAL_STATE_FILE` to use a different local state file. In browser-only preview, the app also tries `/rbage/data/newsletter-snapshot.json` before falling back to the embedded seed snapshot.

Run the deterministic local checks with `npm run smoke:all`. Browser coverage for the production `/rbage/` path runs with `npm run smoke:browser`, which builds, starts a local preview server, runs Playwright against `http://127.0.0.1:5174/rbage/`, and then stops the server.

After deployment, verify the public Collected route and data endpoints with:

```sh
npm run check:deployed
npm run check:deployed -- --require-ready
npm run check:deployed -- --require-database
npx vercel domains inspect collected.ga
npx vercel alias ls
```

That checks `https://collected.ga/rbage/`, the `/rbage/` asset base path, the static public snapshot, `GET /api/newsletter/items`, `GET /api/newsletter/status`, `GET /api/newsletter/health`, and the draft publishing API in JSON, Markdown, and manifest formats. Add `--require-ready` after editorial review to apply the same publishing readiness criteria used by Ulysses export to the deployed/static/API snapshots and `GET /api/newsletter/draft?require-ready=true`. Add `--require-database` after configuring external Postgres to prove the deployed API reports writable `database` persistence with enough loaded items, source runs, and query plans. The Vercel project has `collected.ga` attached as the custom domain and aliased to the latest production deployment; if DNS is still propagating, confirm Vercel sees the domain with `npx vercel domains inspect collected.ga` and the alias with `npx vercel alias ls`, then retry the public check. For a Vercel deployment protected by Vercel Authentication, verify the route and API with `npx vercel curl /rbage/ --deployment <deployment-url>`, `npx vercel curl /api/newsletter/items --deployment <deployment-url>`, and `npx vercel curl /api/newsletter/health --deployment <deployment-url>` from the linked project directory. For a local preview server started with `npm run prod:app`, use `npm run check:preview`; that runs the same route/static-snapshot checks without requiring the Vercel API route.

## Database

Apply the sorted migrations in `db/migrations/` to the external Postgres database used by Vercel. `0001_newsletter.sql` creates the current Garbage/newsletter tables; `0002_workbench_views.sql` exposes the same data through generic `workbench_*` views for Verdun reuse.

Use the guarded deployment helper when moving a crawler snapshot into the external database:

```sh
npm run db:deploy
npm run db:deploy -- --apply
```

Without `--apply`, the helper regenerates `/tmp/verdun-newsletter-load.sql` from `public/data/newsletter-snapshot.json`, validates it against the paired snapshot, and stops before touching Postgres. With `--apply`, it also verifies Vercel production has `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL` configured, applies the migration and SQL load through `psql`, and runs `npm run check:deployed -- --require-database` to prove the public API is backed by the external database. Add `--require-ready` to require the deployed database snapshot to pass the publishing-readiness gate after editorial review. Use `--skip-vercel-env` or `--skip-deployed-check` only for local database drills.

## Crawler

```sh
cargo run --manifest-path crawler/Cargo.toml -- collect --out crawler/data/items.json
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot public/data/newsletter-snapshot.json --out /tmp/verdun-load.sql
npm run db:apply -- --sql /tmp/verdun-load.sql --snapshot public/data/newsletter-snapshot.json
```

`collect` writes `crawler/data/items.json` for item loader work, `crawler/data/source-runs.json` for source-health loader work, and `public/data/newsletter-snapshot.json` as the app's static fallback when no external database is configured. The public snapshot includes item rows, source-health metadata, and crawler query plans with source-specific review targets for HN, Lobste.rs, dev.to, Medium, Substack, LinkedIn, and X/Twitter. `collect` and `queries` read `crawler/data/editorial-state.json` by default when it exists, so saved this-week focus requests can add `focus_terms` to matching project query plans; use `--editorial-state path/to/state.json` to point at an exported editorial state file.
`export-sql --snapshot` loads that cohesive public snapshot into SQL for external Postgres, keeping item rows, source-health rows, query-plan rows, and the snapshot `generated_at` collection timestamp from the same crawler run. The older `--input` plus `--source-runs` path remains available for debugging split files. `npm run db:apply` validates the SQL against the paired snapshot and stops as a dry run by default; pass `--apply` with `POSTGRES_URL`, `DATABASE_URL`, `NEON_DATABASE_URL`, or `--database-url` to apply `db/migrations/0001_newsletter.sql` and then the generated load through `psql`.
Database-backed API snapshots and status responses derive `generatedAt` from the newest `newsletter_source_runs.collected_at` value, falling back to item `updated_at`, so deployed draft issue dates track the crawler/load run instead of the moment a serverless route is called.

`npm run audit:grust` reads the local Grust workspace, derives the backend and typed-validation projects it exposes through crates, dependencies, and docs, and writes an ignored `crawler/data/grust-watchlist-audit.md`. The command fails if Verdun stops watching a Grust-derived project such as HelixDB, SurrealDB, pgGraph, FalkorDB, LadybugDB, LanceDB, Grust Sail, CocoIndex, Garde, zod-rs, Apache Arrow, or Delta Lake. Use `-- --grust-root /path/to/grust` when auditing a different checkout.

For a weekly public-source pass:

```sh
cargo run --manifest-path crawler/Cargo.toml -- verify
cargo run --manifest-path crawler/Cargo.toml -- queries
npm run audit:grust
cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot public/data/newsletter-snapshot.json --out /tmp/verdun-newsletter-load.sql
npm run smoke:loader -- /tmp/verdun-newsletter-load.sql public/data/newsletter-snapshot.json
npm run db:apply -- --sql /tmp/verdun-newsletter-load.sql --snapshot public/data/newsletter-snapshot.json
npm run db:deploy -- --sql /tmp/verdun-newsletter-load.sql --snapshot public/data/newsletter-snapshot.json --no-generate
npm run db:deploy -- --sql /tmp/verdun-newsletter-load.sql --snapshot public/data/newsletter-snapshot.json --no-generate --apply
```

Live collection currently supports Hacker News through the Algolia API, Lobste.rs through per-project search result parsing, dev.to through project-tagged public article queries, configured Medium/Substack RSS or Atom feeds, and manual JSON imports for LinkedIn/X posts. Matching uses conservative project-name/distinctive-keyword checks with term boundaries, and feed matching looks across descriptions, summaries, and full encoded RSS/Atom content while keeping item summaries concise. Manual social imports report how many reviewed posts were considered and mark the source run as stale when the newest reviewed post is outside the active `--since-days` window, which feeds the same source-health readiness gate used by Ulysses export. `queries` prints the non-network query plan for each watched project, including HN query text, distinctive live terms, dev.to tags, and review URLs for public search surfaces plus constrained LinkedIn/X review. Each item carries normalized provenance in `raw_json.provenance` so downstream loaders and editorial tools can audit which adapter produced the evidence. The watchlist covers the initial AI/data projects plus functional/composable AI/data tools such as BAML, DSPy, Instructor, Ibis, and Dagster; Grust-adjacent graph, Sail/lakehouse, Arrow/DataFusion/Delta substrate, validation crates such as Garde and zod-rs, and indexing systems including Grust Sail, FalkorDB, LadybugDB, and CocoIndex. The verifier checks that the required projects, public-source adapters, publication feeds, and manual social import files are all configured before a weekly pass.

`collect --live` defaults to `--since-days 45` for live/manual source items so stale search hits do not enter the weekly queue. Use a different positive value when preparing a broader catch-up issue.

Manual social imports live at:

- `crawler/data/manual/linkedin.json`
- `crawler/data/manual/x-twitter.json`

Use those files for exported, saved, or explicitly reviewed posts rather than unauthenticated scraping. Keep their `published_at` values current for the issue being prepared; stale manual files show up as source-health errors during `collect --live`. Future authenticated adapters can reuse the same normalized post shape.

## Weekly Operating Sequence

1. Run `cargo run --manifest-path crawler/Cargo.toml -- verify`, `cargo run --manifest-path crawler/Cargo.toml -- queries`, and `npm run audit:grust` before network collection to confirm the watchlist, Grust alignment, source adapters, and search terms.
2. Run `cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2` to refresh `public/data/newsletter-snapshot.json`.
3. Run `cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot public/data/newsletter-snapshot.json --out /tmp/verdun-newsletter-load.sql`.
4. Run `npm run db:deploy -- --sql /tmp/verdun-newsletter-load.sql --snapshot public/data/newsletter-snapshot.json --no-generate` as a dry run before applying SQL to the external database; it checks row counts, source-run metadata, the preserved snapshot collection timestamp, query plans, required projects, tags, URLs, and provenance JSON.
5. Run `npm run db:deploy -- --sql /tmp/verdun-newsletter-load.sql --snapshot public/data/newsletter-snapshot.json --no-generate --apply` with the external Postgres URL set and Vercel production env configured, then open the app at `collected.ga/rbage/` to upvote/downvote items and save this-week or ongoing focus notes.
6. Run `npm run review:gaps` to write `crawler/data/source-gap-review.md`, then work the uncovered-project checklist before final editorial picks.
7. Run `npm run check:deployed -- --require-ready` to verify the deployed route/API are serving a publishing-ready reviewed snapshot.
8. Run `npm run ulysses:ready` to write the gated local Markdown export and paired publish manifest for Ulysses once readiness passes.

## Drafting for Ulysses

Build a local Markdown draft from the current public snapshot for editing and publishing with Ulysses:

```sh
npm run draft
```

The app's draft preview also exposes Markdown download and copy controls for the same shared draft builder output, plus a publish manifest JSON download for auditing the selected spine before local export.

The generated article is written to `crawler/data/newsletter-draft.md` by default and includes a weekly throughline, an editorial arc for the selected spine, item selection reasons, source-linked item evidence lines from crawler provenance, source coverage gaps with crawler query hints, plus this-week and ongoing editorial focus notes when they are present in the local snapshot; in static local mode it uses the same fallback focus as the app preview. The app preview and CLI both use the shared publish manifest builder from `src/lib/newsletter.ts`; file exports write a sibling `.manifest.json` file recording issue identity metadata, the paired Markdown path, snapshot input, selected item IDs, selected item metadata with selection reasons, votes, focuses, readiness checks, prose-quality checks, source coverage, source runs, and query-plan count. The CLI uses the same draft builder as the Vue app, so the on-screen draft spine and local Markdown export stay aligned. When `crawler/data/editorial-state.json` exists, local app votes and focus notes are applied before the draft is built; set `NEWSLETTER_APPLY_LOCAL_STATE=false` to render the raw snapshot.

The app's draft preview also offers `Editorial state` JSON export and import. The file contains the current `{ votes, focuses }` payload in the same shape as `crawler/data/editorial-state.json`, so a browser-only review session can be audited, restored in the app, or reused by setting `VERDUN_LOCAL_STATE_FILE` before running `npm run ulysses:ready`.

For projects still missing live/manual source matches, run:

```sh
npm run review:gaps
```

That writes an ignored `crawler/data/source-gap-review.md` checklist from the current snapshot, grouping uncovered projects with their Hacker News, Lobste.rs, dev.to, Medium, Substack, LinkedIn, and X/Twitter review targets. Add useful reviewed social finds to the manual JSON files, then rerun `collect --live`.

When the deployed API is backed by external Postgres, importing that same editorial-state JSON in the app also persists matching item votes and non-duplicate focus notes through `POST /api/newsletter/editorial-state`. This provides the bridge from temporary browser-local review to durable editorial state once `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL` is configured in Vercel.

When no items are explicitly upvoted, the draft builder prefers live/manual collected items over watchlist seed placeholders and caps the fallback spine at two items per project before filling any remaining slots.

The draft renderer also rewrites thin feed snippets, generic feed captions, author labels, and crawler boilerplate into source-aware/project-aware sentences before Markdown or Ghost HTML is produced.

```sh
NEWSLETTER_SNAPSHOT_FILE=https://collected.ga/api/newsletter/items npm run draft
NEWSLETTER_REQUIRE_UPVOTES=true npm run ulysses:draft
NEWSLETTER_REQUIRE_READY=true npm run ulysses:draft
npm run ulysses:ready
npm run ulysses:ready -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
NEWSLETTER_DRAFT_OUT=/path/to/ulysses-import/verdun-weekly.md npm run ulysses:draft -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
ULYSSES_IMPORT_DIR=/path/to/ulysses-import npm run ulysses:ready -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
```

The snapshot input can be a local JSON file or an `http(s)` URL such as the deployed Vercel items API. Set `NEWSLETTER_REQUIRE_UPVOTES=true` or pass `--require-upvotes` to fail instead of publishing a fallback-ranked draft when no item has been explicitly upvoted. Set `NEWSLETTER_REQUIRE_READY=true` or pass `--require-ready` to apply the same publishing readiness checks shown in the app plus prose-quality checks that catch stale snapshots, missing throughline/arc, crawler/feed boilerplate, missing per-selected-item source-linked evidence, missing source links, missing credo fit, and missing selection audit before writing the Ulysses Markdown draft. After saving upvotes and focus notes in the app, `npm run ulysses:ready` applies both gates and writes the dated Ulysses export plus a same-stem `.manifest.json`; it intentionally fails if the local editorial state is not ready. Pass `--editorial-state /path/to/exported-state.json` to use a downloaded app `Editorial state` file directly; the paired manifest records that path as `editorialStateInput`. Without `NEWSLETTER_DRAFT_OUT`, `npm run ulysses:draft` and `npm run ulysses:ready` write a dated file under `crawler/data/ulysses/`, such as `2026-06-15-strongly-typed-ai-data-notes-june-15-2026.md`, alongside `2026-06-15-strongly-typed-ai-data-notes-june-15-2026.manifest.json`. That directory is ignored by git and is meant as the local Ulysses export area. Set `ULYSSES_DRAFT_DIR` to choose another export directory. Set `ULYSSES_IMPORT_DIR` or pass `--ulysses-import-dir /path/to/ulysses-import` to copy the generated Markdown and manifest pair into an external Ulysses handoff folder after the export succeeds.

An optional Ghost helper remains available for direct API drafts from the same local snapshot, but the editorial publishing sequence is local Markdown into Ulysses:

```sh
npm run ghost:dry-run
npm run ghost:dry-run -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
npm run ghost:dry-run -- --manifest-out /path/to/ghost-publish.manifest.json

GHOST_ADMIN_API_URL=https://collected.ga \
GHOST_ADMIN_API_KEY='admin-key-id:admin-key-secret' \
GHOST_MANIFEST_OUT=/path/to/ghost-publish.manifest.json \
npm run ghost:ready -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
```

`ghost:dry-run` prints the Ghost Admin API endpoint, post payload, and publish manifest without requiring credentials or making a network request. Pass `--editorial-state /path/to/exported-state.json` to apply the same browser-exported votes and focus notes used by `npm run ulysses:ready`; the paired manifest records that path as `editorialStateInput`. Pass `--manifest-out /path/to/file.json` or set `GHOST_MANIFEST_OUT` to write the same audit bundle to disk for dry-run or real publishing. The payload uses the same rendered draft as the Ulysses export and includes a deterministic slug, bounded excerpt, meta title, meta description, and newsletter taxonomy tags. `ghost:ready` uses the Ghost Admin API key format directly, applies the upvote/readiness gates, and posts with `status=draft`. Real Ghost API writes refuse ungated drafts unless `--allow-ungated-publish` or `GHOST_ALLOW_UNGATED_PUBLISH=true` is set. Non-draft Ghost statuses such as `published`, `scheduled`, or `sent` require `--allow-non-draft` or `GHOST_ALLOW_NON_DRAFT=true`.
