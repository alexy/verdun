# Verdun

Verdun is being extracted into the reusable core for database-backed collection/review workbenches. The current repository still carries the Garbage and Greathouse instance proofs while that extraction is underway, but the intended Verdun core is the generic Vercel app shell, API/database contract, and Rust crawler/reloader boundary.

The first reusable boundary is now explicit:

- Generic workbench contracts live in `src/core/workbench.ts`.
- Generic frontend filtering/count/coverage logic lives in `src/composables/useWorkbenchView.ts`.
- Generic reusable Vue controls live under `src/components/workbench/` and currently back both the Garbage newsletter app and the Greathouse pilot workbench.
- Garbage instance configuration and default workbench instance registration live in the parent package at `apps/garbage/src/config.ts` and `apps/garbage/src/instance-registration.ts`; Verdun core no longer imports or registers the Garbage frontend.
- Garbage-specific ontology, newsletter, browser snapshot-normalization logic, browser composables, app components, app entrypoint, app styles, newsletter API routes, deployment profile, and crawler crate live in the parent package under `apps/garbage/`; Verdun no longer imports or registers the Garbage frontend, API routes, deploy profile, or crawler implementation.
- A Greathouse pilot instance lives in `src/instances/greathouse/` and exercises property listing and blocked-source diagnostic records through the same `WorkbenchSnapshot` and generic view model.
- Generic database tables (`instances`, `records`, `source_runs`, `collection_plans`, `review_state`, `focuses`) and reusable `workbench_*` views live in `db/migrations/0003_generic_workbench_tables.sql`; Garbage newsletter table/view compatibility migrations live under parent-owned `apps/garbage/db/instances/garbage/migrations/` and are selected by the Garbage deploy profile.
- Generic crawler structs live in `crawler/src/core.rs`; crawler instances now return `CrawlerCollection` with a core `CrawlerSnapshot`, while any legacy item/public JSON compatibility payloads stay instance-owned. Greathouse adapters emit core `NormalizedRecord` values directly from local JSON, HTTP JSON, HTTP status diagnostics, browser diagnostics, Redfin-shaped listings, and Zillow-shaped listings.
- Crawler instance modules export a neutral `CRAWLER_INSTANCE` registration; the shared Rust registry no longer consumes Garbage/Greathouse-named static instance symbols.
- Bundled crawler instance modules are isolated behind `crawler/src/instances/bundled.rs`; Verdun's bundled crawler is Greathouse/demo-only, while app crawlers register against the exported `verdun-crawler` runtime from their own crates.
- Crawler default item payload, source-run, public snapshot, config, and editorial-state paths are instance-owned metadata rather than shared `crawler/data/*` CLI defaults.
- Generic Vercel workbench surfaces live under `api/workbench/`; routes resolve their instance from explicit route/query metadata while the DB helper can read/write any `WorkbenchInstance` namespace such as the Greathouse pilot.
- Generic local workbench adapter contracts live in `api/workbench/local-adapter-types.ts`; instance-specific fallback adapters export neutral registration metadata from their own namespace.
- Vite base-path selection and `vercel.json` routing derive from registered deploy profiles; Verdun's default bundled profile is Greathouse at `/greathouse/`, while Garbage owns its own Vercel config under `apps/garbage/vercel.json` for `/rbage/`.
- Instance deploy-check modules export neutral `deployCheckProfile` metadata, and the shared deployment registry discovers `scripts/instances/*/deploy-checks.mjs` profiles by convention.
- Garbage deploy-check profile metadata and hooks are parent-owned at `apps/garbage/scripts/deploy-checks.mjs`, `apps/garbage/scripts/check-deployed.mjs`, `apps/garbage/scripts/deployed-check-smoke-fixture.mjs`, and `apps/garbage/scripts/deployed-draft-checks.mjs`; Garbage opts into Verdun's generic deployed checker through `VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES`.
- Garbage deploy-profile metadata declares an external npm-workspace command runner for `@garbage/instance`; shared orchestration such as `smoke:all` and `smoke:browser` now executes Garbage commands through that package instead of Verdun-local `garbage:*` package scripts.
- Deployed draft/readiness checks are deploy-profile hooks; Garbage owns newsletter draft validation under parent-owned `apps/garbage/scripts/`, while the shared deployment checker validates only generic route, snapshot, status, and health mechanics.
- Existing newsletter routes, scripts, and database tables are explicit Garbage compatibility surfaces while the boundary is extracted incrementally.

The current proof points are:

- Vue/Vite app deployed by Vercel.
- Vite is built from deploy profile metadata; Verdun's bundled default profile uses `/greathouse/`, and Garbage owns the `/rbage/` app build under `apps/garbage/`.
- Vercel serverless API routes reading an external Postgres database.
- Rust crawler/loader crate that collects instance-owned records and exports SQL for the generic database shape.
- Greathouse crawler adapters for local fixtures, HTTP JSON, status diagnostics, browser diagnostics, Redfin-shaped listings, and Zillow-shaped listings, all preserving the same `CrawlerSnapshot` contract.
- Garbage Grust watchlist audit that checks the Garbage crawler still tracks the backend and typed-validation projects surfaced by the local `/Users/alexy/src/grust` workspace.
- Crawler output keeps normalized provenance inside each item's `raw_json`, including source adapter, evidence URL, matched project, and matched keywords.
- Crawler output deduplicates live/manual items by canonical URL, preferring stronger reviewed evidence while retaining duplicate source records in `raw_json.duplicates`.
- Editorial/public UI for upvoting/downvoting news items and writing this-week or ongoing focus requests.
- Public item cards show HN-style voting plus Strongly Typed AI credo blurbs linked to the maintained ontology panel.
- Public item cards surface crawler provenance as editorial evidence, including the adapter/stage that brought each item into the queue.
- Item cards use labeled Include/Skip controls with pressed-state feedback so browser-local editorial votes are visibly actionable on desktop and mobile-sized layouts.
- Inbox filters can isolate live/manual collected evidence from watchlist seed placeholders for faster publish review.
- `GET /api/garbage/newsletter/draft` exposes the same generated draft as JSON, Markdown, HTML, or publish manifest for local automation and audit.
- `GET /api/garbage/newsletter/health` exposes the Greathouse-style service health surface: database env state, read/write routes, guarded publishing commands, loader expectations, and active snapshot counts.
- Publish manifests and the draft preview summarize selected evidence by live/manual/seed counts and source mix before Ulysses or Ghost handoff.
- Publishing readiness checks show whether the queue has explicit editorial picks, live source/project coverage, project spread, saved focus, healthy watched sources, and a fresh collection snapshot before local Ulysses export.
- Source health calls out watched projects from the crawler query plan that lack live/manual source coverage, shows crawler query hints and source-specific review links for those gaps, and lets the editor save a this-week collection request from a gap with one click.
- The maintained Garbage ontology lives in `apps/garbage/src/ontology.json` and is reused by the app and local Markdown draft generation.
- The reusable Vue pieces live under `src/components/workbench/`; Garbage-specific panels and newsletter controls live under parent-owned `apps/garbage/src/app/components/` and are mounted by the Garbage app package itself.
- Garbage-specific newsletter app components, publishing/ontology/source-gap CSS, and browser composables live under parent-owned `apps/garbage/src/app/`; shared shell/workbench CSS remains in Verdun `src/style.css`.
- Generic frontend filtering/count/coverage logic lives in `src/composables/useWorkbenchView.ts`; Garbage-specific snapshot loading, optimistic vote/focus persistence, draft state, and readiness derivation live under parent-owned `apps/garbage/src/app/composables/`.
- Generic backend route mechanics live in `api/core/http.ts`; Garbage data access and local fallback state live under parent-owned `apps/garbage/src/api/`.
- Generic workbench DB helpers require an explicit `WorkbenchInstance`; default-instance resolution stays in the route/registry layer instead of the database helper.
- Bundled API fallback adapters are isolated behind `api/instances/bundled-workbench-adapters.ts`; the generic adapter registry no longer imports the Garbage adapter directly.
- Generic app and instance registries discover `src/instances/*/app.ts` and `src/instances/*/instance.ts` registration modules by convention; Garbage and Greathouse component/config names stay inside their own instance namespaces.
- Generic local adapter type and registration contracts live under `api/workbench/`; Verdun no longer bundles a Garbage no-database adapter.
- The app's editorial-state import posts `{ votes, focuses }` to `POST /api/garbage/newsletter/editorial-state` when the API is writable, so browser-local review work can be promoted into durable Postgres state after external database setup.

The extraction is still incomplete, but Garbage implementation ownership has moved out of Verdun for the frontend app, newsletter API routes/store, crawler crate, deployment-check wrapper, publishing scripts, and compatibility SQL. The next architectural move is to reduce remaining shared-runtime/test-loader coupling until Garbage and Greathouse are ordinary consumers of Verdun core contracts.

The parent Garbage repo now tracks `../apps/garbage/verdun.instance.json` as the external instance-package anchor for app-owned paths and remaining shared Verdun dependencies. The parent repo exposes the `@garbage/instance` package command facade. Publishing entrypoints such as `npm run garbage:draft`, `npm run garbage:review:gaps`, and `npm run garbage:ulysses:ready` live in the parent package with a package-owned newsletter draft builder, ontology copy, workbench projection, default publishing data under `apps/garbage/data/`, package-owned draft/URL-draft/readiness/source-gap/Ulysses/Ghost/public-snapshot/recency/API smoke coverage, parent-owned browser smoke coverage, and parent-owned Grust watchlist/dedupe/provenance/manual-source/query-plan crawler smoke commands. The local API smokes are also parent-owned and exercise app-owned route/store modules through a shared TypeScript migration loader. Operations such as `npm run garbage:smoke:workbench` remain app commands, even when they intentionally load generic Verdun workbench API helpers for compatibility coverage.
The Grust watchlist audit and smoke scripts are parent-owned under `apps/garbage/scripts/`, so Grust alignment remains a Garbage package concern. Verdun `package.json` no longer exposes `garbage:*` commands; generic orchestration reaches app commands through deploy-profile command-runner metadata.
Verdun no longer tracks Garbage crawler/newsletter seed artifacts under `crawler/data/` or `public/data/newsletter-snapshot.json`; Garbage crawler defaults and publishing snapshots live under `apps/garbage/data/`.

## Local app

```sh
npm install
npm run dev:app
```

Open `http://127.0.0.1:5176`.

Without `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`, the API uses the checked-in static crawler snapshot. On Vercel this is a read-only API snapshot, so the app reports `Browser-local edits` and persists votes/focus notes to browser storage for refresh-safe review, editorial-state export/import, and Ulysses handoff. In local Garbage development without a database, votes and focus notes are persisted to ignored `apps/garbage/data/editorial-state.json`; set `VERDUN_LOCAL_STATE_FILE` to use a different local state file. In browser-only preview, the app also tries `/rbage/data/newsletter-snapshot.json` before falling back to the embedded seed snapshot.
Set `VERDUN_STATIC_SNAPSHOT_FILE` to point app-owned API modules at an explicit Garbage snapshot file; the parent Garbage package uses this so API smokes can run from `/Users/alexy/src/garbage` against `apps/garbage/data/newsletter-snapshot.json` without changing cwd into Verdun.
Garbage's newsletter-to-workbench projection, newsletter store, workbench adapter, and newsletter route handlers live in the parent package. Verdun `npm run smoke:workbench` fails if resident Garbage API/frontend shims reappear.
Garbage's browser-local editorial state, workbench snapshot loading, newsletter view filtering, newsletter UI, and default-instance metadata are parent-owned under `apps/garbage/src/`; Verdun has no resident Garbage frontend shims or frontend registration modules.

Run `npm run vercel:config` in Verdun after changing bundled deploy profiles; it regenerates Verdun `vercel.json` routes for the bundled Greathouse/demo app path. Garbage owns its `/rbage/` Vercel config under `apps/garbage/vercel.json`. Run Verdun deterministic checks with `npm run smoke:all`. Garbage browser coverage for the production `/rbage/` path runs from the parent package as `npm run garbage:smoke:app` and `npm run garbage:smoke:responsive`; shared Verdun browser orchestration invokes those through deploy-profile command-runner metadata when needed.

After deployment, verify the public Collected route and data endpoints with:

```sh
npm run check:deployed
npm run check:deployed -- --require-ready
npm run check:deployed -- --require-database
npx vercel domains inspect collected.ga
npx vercel alias ls
```

That checks `https://collected.ga/rbage/`, the `/rbage/` asset base path, the static public snapshot, `GET /api/garbage/newsletter/items`, `GET /api/garbage/newsletter/status`, `GET /api/garbage/newsletter/health`, and the draft publishing API in JSON, Markdown, and manifest formats. Add `--require-ready` after editorial review to apply the same publishing readiness criteria used by Ulysses export to the deployed/static/API snapshots and `GET /api/garbage/newsletter/draft?require-ready=true`. Add `--require-database` after configuring external Postgres to prove the deployed API reports writable `database` persistence with enough loaded items, source runs, and query plans. The Vercel project has `collected.ga` attached as the custom domain and aliased to the latest production deployment; if DNS is still propagating, confirm Vercel sees the domain with `npx vercel domains inspect collected.ga` and the alias with `npx vercel alias ls`, then retry the public check. For a Vercel deployment protected by Vercel Authentication, verify the route and API with `npx vercel curl /rbage/ --deployment <deployment-url>`, `npx vercel curl /api/garbage/newsletter/items --deployment <deployment-url>`, and `npx vercel curl /api/garbage/newsletter/health --deployment <deployment-url>` from the linked project directory. For a local preview server started with `npm run prod:app`, use `npm run check:preview`; that runs the same route/static-snapshot checks without requiring the Vercel API route.

## Database

Apply migrations through the guarded helpers rather than applying every SQL file by directory. Verdun's reusable database contract lives in `db/migrations/0003_generic_workbench_tables.sql`; Garbage's legacy newsletter tables and fallback `workbench_*` view overlay live under parent-owned `apps/garbage/db/instances/garbage/migrations/` and are selected by the Garbage deploy profile.

Use the guarded deployment helper when moving a crawler snapshot into the external database:

```sh
npm run db:deploy
npm run db:deploy -- --apply
```

Without `--apply`, the helper regenerates `/tmp/verdun-workbench-load.sql` from the default deploy profile snapshot, validates it against the paired snapshot, and stops before touching Postgres. With `--apply`, it also verifies Vercel production has `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL` configured, applies the migration and SQL load through `psql`, and runs `npm run check:deployed -- --require-database` to prove the public API is backed by the external database. Add `--require-ready` for Garbage after editorial review. Use `--skip-vercel-env` or `--skip-deployed-check` only for local database drills.

## Crawler

The reusable crawler core lives under `crawler/src/`; crawler instances own domain adapters and return a core `CrawlerCollection`. Verdun exports the `verdun-crawler` library/runtime and bundles Greathouse as its local proof instance. Garbage owns its crawler config, manual social review files, Rust instance implementation, and binary under `apps/garbage/crawler/`; it depends on `../../verdun/crawler` and registers its own instance locally. Generic SQL export runs through the core `CrawlerSnapshot` shape instead of writing directly from Garbage-specific newsletter items.

```sh
cargo run --manifest-path crawler/Cargo.toml -- collect --instance greathouse --generic-out /tmp/greathouse-snapshot.json
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot /tmp/greathouse-snapshot.json --out /tmp/verdun-load.sql --instance greathouse
npm run db:apply -- --sql /tmp/verdun-load.sql --snapshot /tmp/greathouse-snapshot.json
```

`collect` writes the selected bundled instance's item payload, source-health rows, and public snapshot to instance-owned default paths unless `--out`, `--source-runs-out`, `--public-out`, or `--generic-out` are supplied. Verdun's bundled crawler is Greathouse/demo-only; Garbage collection uses the parent-owned crate shown below. Greathouse defaults live under `crawler/instances/greathouse/data/` plus `public/data/greathouse-snapshot.json`, and its public snapshot is the generic `CrawlerSnapshot` shape. Add `--generic-out path/to/snapshot.json` to always write the core `CrawlerSnapshot` beside any compatibility payload. `collect` and `queries` read the selected instance's default editorial state when it exists, so saved focus requests can add `focus_terms` to matching collection plans; use `--editorial-state path/to/state.json` to point at an exported editorial state file.
`export-sql --snapshot` loads a cohesive public or generic snapshot into SQL for external Postgres, keeping records, source-health rows, collection-plan rows, and the snapshot `generated_at` collection timestamp from the same crawler run. By default it emits the reusable Verdun contract load into `instances`, `records`, `source_runs`, and `collection_plans`. Use `--target newsletter` only for explicit Garbage/newsletter compatibility table loads; legacy Garbage snapshot and split-file payload parsing is owned by the Garbage crawler instance rather than shared CLI code. The generic export defaults to the selected instance namespace and can be pointed at another namespace with `--instance`, `--instance-name`, and `--base-path`. The older `--input` plus `--source-runs` path remains available for debugging split files. `npm run db:apply` validates the SQL against the paired snapshot and stops as a dry run by default; pass `--apply` with `POSTGRES_URL`, `DATABASE_URL`, `NEON_DATABASE_URL`, or `--database-url` to apply sorted migrations and then the generated load through `psql`.
Database-backed API snapshots and status responses derive `generatedAt` from the newest `newsletter_source_runs.collected_at` value, falling back to item `updated_at`, so deployed draft issue dates track the crawler/load run instead of the moment a serverless route is called.

`npm run garbage:audit:grust` reads the local Grust workspace, derives the backend and typed-validation projects it exposes through crates, dependencies, and docs, and writes an ignored `apps/garbage/data/grust-watchlist-audit.md` file in the parent Garbage package. The command fails if the Garbage crawler stops watching a Grust-derived project such as HelixDB, SurrealDB, pgGraph, FalkorDB, LadybugDB, LanceDB, Grust Sail, CocoIndex, Garde, zod-rs, Apache Arrow, or Delta Lake. Use `-- --grust-root /path/to/grust` when auditing a different checkout.

For a weekly public-source pass:

```sh
cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- verify
cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- queries
npm run garbage:audit:grust
cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- collect --live --max-live-per-project 2
cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- export-sql --snapshot apps/garbage/data/newsletter-snapshot.json --out /tmp/verdun-generic-load.sql
npm run smoke:generic-loader -- /tmp/verdun-generic-load.sql apps/garbage/data/newsletter-snapshot.json
npm run db:apply -- --sql /tmp/verdun-generic-load.sql --snapshot apps/garbage/data/newsletter-snapshot.json
npm run db:deploy -- --sql /tmp/verdun-generic-load.sql --snapshot apps/garbage/data/newsletter-snapshot.json --no-generate
npm run db:deploy -- --sql /tmp/verdun-generic-load.sql --snapshot apps/garbage/data/newsletter-snapshot.json --no-generate --apply
cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- export-sql --target newsletter --snapshot apps/garbage/data/newsletter-snapshot.json --out /tmp/verdun-newsletter-load.sql
npm run garbage:smoke:loader -- /tmp/verdun-newsletter-load.sql apps/garbage/data/newsletter-snapshot.json
npm run garbage:db:deploy:newsletter -- --sql /tmp/verdun-newsletter-load.sql --snapshot apps/garbage/data/newsletter-snapshot.json --no-generate
```

Live collection currently supports Hacker News through the Algolia API, Lobste.rs through per-project search result parsing, dev.to through project-tagged public article queries, configured Medium/Substack RSS or Atom feeds, and manual JSON imports for LinkedIn/X posts. Matching uses conservative project-name/distinctive-keyword checks with term boundaries, and feed matching looks across descriptions, summaries, and full encoded RSS/Atom content while keeping item summaries concise. Manual social imports report how many reviewed posts were considered and mark the source run as stale when the newest reviewed post is outside the active `--since-days` window, which feeds the same source-health readiness gate used by Ulysses export. `queries` prints generic `NormalizedCollectionPlan` JSON for each watched subject, including query text, distinctive live terms, tags, review targets, and focus terms. Garbage compatibility snapshots still expose newsletter field names such as `hacker_news_query` and `dev_to_tags`. Each item carries normalized provenance in `raw_json.provenance` so downstream loaders and editorial tools can audit which adapter produced the evidence. The watchlist covers the initial AI/data projects plus functional/composable AI/data tools such as BAML, DSPy, Instructor, Ibis, and Dagster; Grust-adjacent graph, Sail/lakehouse, Arrow/DataFusion/Delta substrate, validation crates such as Garde and zod-rs, and indexing systems including Grust Sail, FalkorDB, LadybugDB, and CocoIndex. The verifier checks that the required projects, public-source adapters, publication feeds, and manual social import files are all configured before a weekly pass.

`collect --live` defaults to `--since-days 45` for live/manual source items so stale search hits do not enter the weekly queue. Use a different positive value when preparing a broader catch-up issue.

Manual social imports live at:

- `apps/garbage/crawler/instances/garbage/manual/linkedin.json`
- `apps/garbage/crawler/instances/garbage/manual/x-twitter.json`

Use those files for exported, saved, or explicitly reviewed posts rather than unauthenticated scraping. Keep their `published_at` values current for the issue being prepared; stale manual files show up as source-health errors during `collect --live`. Future authenticated adapters can reuse the same normalized post shape.

## Weekly Operating Sequence

1. From the parent repo, run `cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- verify`, `cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- queries`, and `npm run garbage:audit:grust` before network collection to confirm the Garbage watchlist, Grust alignment, source adapters, and search terms.
2. Run `cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- collect --live --max-live-per-project 2` to refresh `apps/garbage/data/newsletter-snapshot.json`.
3. Run `cargo run --manifest-path apps/garbage/crawler/Cargo.toml -- export-sql --snapshot apps/garbage/data/newsletter-snapshot.json --out /tmp/verdun-generic-load.sql`.
4. Run `npm run db:deploy -- --sql /tmp/verdun-generic-load.sql --snapshot apps/garbage/data/newsletter-snapshot.json --no-generate` as a dry run before applying SQL to the external database; it checks row counts, source-run metadata, the preserved snapshot collection timestamp, collection plans, required subjects, tags, URLs, and provenance JSON.
5. Run `npm run db:deploy -- --sql /tmp/verdun-generic-load.sql --snapshot apps/garbage/data/newsletter-snapshot.json --no-generate --apply` with the external Postgres URL set and Vercel production env configured, then open the app at `collected.ga/rbage/` to upvote/downvote items and save this-week or ongoing focus notes. For legacy Garbage newsletter tables, export with `--target newsletter` and use `npm run garbage:db:deploy:newsletter -- --sql /tmp/verdun-newsletter-load.sql --snapshot apps/garbage/data/newsletter-snapshot.json --no-generate`.
6. Run `npm run garbage:review:gaps` to write `apps/garbage/data/source-gap-review.md`, then work the uncovered-project checklist before final editorial picks.
7. Run `npm run check:deployed -- --require-ready` to verify the deployed route/API are serving a publishing-ready reviewed snapshot.
8. Run `npm run garbage:ulysses:ready` to write the gated local Markdown export and paired publish manifest for Ulysses once readiness passes.

## Drafting for Ulysses

Build a local Markdown draft from the current public snapshot for editing and publishing with Ulysses:

```sh
npm run garbage:draft
```

The app's draft preview also exposes Markdown download and copy controls for the same shared draft builder output, plus a publish manifest JSON download for auditing the selected spine before local export.

The generated article is written to `apps/garbage/data/newsletter-draft.md` by default and includes a weekly throughline, an editorial arc for the selected spine, item selection reasons, source-linked item evidence lines from crawler provenance, source coverage gaps with crawler query hints, plus this-week and ongoing editorial focus notes when they are present in the local snapshot; in static local mode it uses the same fallback focus as the app preview. The Garbage app preview and CLI both use the publish manifest builder from `apps/garbage/src/newsletter.ts`; file exports write a sibling `.manifest.json` file recording issue identity metadata, the paired Markdown path, snapshot input, selected item IDs, selected item metadata with selection reasons, votes, focuses, readiness checks, prose-quality checks, source coverage, source runs, and query-plan count. The CLI uses the same draft builder as the Vue app, so the on-screen draft spine and local Markdown export stay aligned. When `apps/garbage/data/editorial-state.json` exists, local app votes and focus notes are applied before the draft is built; set `NEWSLETTER_APPLY_LOCAL_STATE=false` to render the raw snapshot.

The app's draft preview also offers `Editorial state` JSON export and import. The file contains the current `{ votes, focuses }` payload in the same shape as `apps/garbage/data/editorial-state.json`, so a browser-only review session can be audited, restored in the app, or reused by setting `VERDUN_LOCAL_STATE_FILE` before running `npm run garbage:ulysses:ready`.

For projects still missing live/manual source matches, run:

```sh
npm run garbage:review:gaps
```

That writes an ignored `apps/garbage/data/source-gap-review.md` checklist from the current snapshot, grouping uncovered projects with their Hacker News, Lobste.rs, dev.to, Medium, Substack, LinkedIn, and X/Twitter review targets. Add useful reviewed social finds to the manual JSON files, then rerun `collect --live`.

When the deployed API is backed by external Postgres, importing that same editorial-state JSON in the app also persists matching item votes and non-duplicate focus notes through `POST /api/garbage/newsletter/editorial-state`. This provides the bridge from temporary browser-local review to durable editorial state once `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL` is configured in Vercel.

When no items are explicitly upvoted, the draft builder prefers live/manual collected items over watchlist seed placeholders and caps the fallback spine at two items per project before filling any remaining slots.

The draft renderer also rewrites thin feed snippets, generic feed captions, author labels, and crawler boilerplate into source-aware/project-aware sentences before Markdown or Ghost HTML is produced.

```sh
NEWSLETTER_SNAPSHOT_FILE=https://collected.ga/api/garbage/newsletter/items npm run garbage:draft
NEWSLETTER_REQUIRE_UPVOTES=true npm run garbage:ulysses:draft
NEWSLETTER_REQUIRE_READY=true npm run garbage:ulysses:draft
npm run garbage:ulysses:ready
npm run garbage:ulysses:ready -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
NEWSLETTER_DRAFT_OUT=/path/to/ulysses-import/verdun-weekly.md npm run garbage:ulysses:draft -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
ULYSSES_IMPORT_DIR=/path/to/ulysses-import npm run garbage:ulysses:ready -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
```

The snapshot input can be a local JSON file or an `http(s)` URL such as the deployed Vercel items API. Set `NEWSLETTER_REQUIRE_UPVOTES=true` or pass `--require-upvotes` to fail instead of publishing a fallback-ranked draft when no item has been explicitly upvoted. Set `NEWSLETTER_REQUIRE_READY=true` or pass `--require-ready` to apply the same publishing readiness checks shown in the app plus prose-quality checks that catch stale snapshots, missing throughline/arc, crawler/feed boilerplate, missing per-selected-item source-linked evidence, source links, credo fit, and selection audit before writing the Ulysses Markdown draft. After saving upvotes and focus notes in the app, `npm run garbage:ulysses:ready` applies both gates and writes the dated Ulysses export plus a same-stem `.manifest.json`; it intentionally fails if the local editorial state is not ready. Pass `--editorial-state /path/to/exported-state.json` to use a downloaded app `Editorial state` file directly; the paired manifest records that path as `editorialStateInput`. Without `NEWSLETTER_DRAFT_OUT`, `npm run garbage:ulysses:draft` and `npm run garbage:ulysses:ready` write a dated file under `apps/garbage/data/ulysses/`, such as `2026-06-15-strongly-typed-ai-data-notes-june-15-2026.md`, alongside `2026-06-15-strongly-typed-ai-data-notes-june-15-2026.manifest.json`. That directory is ignored by git and is meant as the local Ulysses export area. Set `ULYSSES_DRAFT_DIR` to choose another export directory. Set `ULYSSES_IMPORT_DIR` or pass `--ulysses-import-dir /path/to/ulysses-import` to copy the generated Markdown and manifest pair into an external Ulysses handoff folder after the export succeeds.

An optional Ghost helper remains available for direct API drafts from the same local snapshot, but the editorial publishing sequence is local Markdown into Ulysses:

```sh
npm run garbage:ghost:dry-run
npm run garbage:ghost:dry-run -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
npm run garbage:ghost:dry-run -- --manifest-out /path/to/ghost-publish.manifest.json

GHOST_ADMIN_API_URL=https://collected.ga \
GHOST_ADMIN_API_KEY='admin-key-id:admin-key-secret' \
GHOST_MANIFEST_OUT=/path/to/ghost-publish.manifest.json \
npm run garbage:ghost:ready -- --editorial-state /path/to/downloaded-verdun-editorial-state.json
```

`garbage:ghost:dry-run` prints the Ghost Admin API endpoint, post payload, and publish manifest without requiring credentials or making a network request. Pass `--editorial-state /path/to/exported-state.json` to apply the same browser-exported votes and focus notes used by `npm run garbage:ulysses:ready`; the paired manifest records that path as `editorialStateInput`. Pass `--manifest-out /path/to/file.json` or set `GHOST_MANIFEST_OUT` to write the same audit bundle to disk for dry-run or real publishing. The payload uses the same rendered draft as the Ulysses export and includes a deterministic slug, bounded excerpt, meta title, meta description, and newsletter taxonomy tags. `garbage:ghost:ready` uses the Ghost Admin API key format directly, applies the upvote/readiness gates, and posts with `status=draft`. Real Ghost API writes refuse ungated drafts unless `--allow-ungated-publish` or `GHOST_ALLOW_UNGATED_PUBLISH=true` is set. Non-draft Ghost statuses such as `published`, `scheduled`, or `sent` require `--allow-non-draft` or `GHOST_ALLOW_NON_DRAFT=true`.
