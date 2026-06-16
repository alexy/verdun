# Verdun

Verdun is the editorial desk for `collected.ga/rbage/`: a Vercel/Vue app plus a Rust crawler/loader for weekly strongly typed and functional AI/data news.

The first slice mirrors the useful Greathouse shape without touching Greathouse:

- Vue/Vite app deployed by Vercel.
- Vite is built with `/rbage/` as the public base path for `collected.ga/rbage/`.
- Vercel serverless API routes reading an external Postgres database.
- Rust crawler/loader crate that collects watchlist items and exports SQL for the database.
- Crawler output keeps normalized provenance inside each item's `raw_json`, including source adapter, evidence URL, matched project, and matched keywords.
- Editorial/public UI for upvoting/downvoting news items and writing this-week or ongoing focus requests.
- Public item cards show HN-style voting plus Strongly Typed AI credo blurbs linked to the maintained ontology panel.
- Public item cards surface crawler provenance as editorial evidence, including the adapter/stage that brought each item into the queue.
- Publishing readiness checks show whether the queue has explicit editorial picks, live source/project coverage, project spread, saved focus, and healthy watched sources before local Ulysses export.
- Source health calls out watched projects that lack live/manual source coverage, so the editor can turn gaps into this-week collection requests.
- The maintained ontology lives in `src/lib/ontology.json` and is reused by the app and local Markdown draft generation.
- The first Greathouse-style reusable Vue pieces live in `src/components/`: `AppHeader.vue`, `EditorialSidebar.vue`, `InboxControls.vue`, `NewsletterDraftPreview.vue`, `NewsletterHero.vue`, `SourceHealthPanel.vue`, and `NewsItemCard.vue`.
- Frontend snapshot loading and optimistic vote/focus persistence live in `src/composables/useNewsletterSnapshot.ts`, while filtering, counts, draft state, and readiness derivation live in `src/composables/useNewsletterView.ts`.
- Backend route mechanics live in `api/newsletter/_http.ts`, while data access and local fallback state stay in `api/newsletter/_db.ts`, matching the Greathouse-style reusable backend boundary.

## Local app

```sh
npm install
npm run dev:app
```

Open `http://127.0.0.1:5176`.

Without `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`, the API uses the checked-in static crawler snapshot. In browser-only preview, the app also tries `/rbage/data/newsletter-snapshot.json` before falling back to the embedded seed snapshot.
Local votes and focus notes are persisted to ignored `crawler/data/editorial-state.json` so the triage workflow survives refreshes before an external database is configured. Set `VERDUN_LOCAL_STATE_FILE` to use a different local state file.

Run the deterministic local checks with `npm run smoke:all`. Browser coverage for the production `/rbage/` path runs with `npm run smoke:browser`, which builds, starts a local preview server, runs Playwright against `http://127.0.0.1:5174/rbage/`, and then stops the server.

After deployment, verify the public Collected route and data endpoints with:

```sh
npm run check:deployed
```

That checks `https://collected.ga/rbage/`, the `/rbage/` asset base path, the static public snapshot, and `GET /api/newsletter/items`. For a local preview server started with `npm run prod:app`, use `npm run check:preview`; that runs the same route/static-snapshot checks without requiring the Vercel API route.

## Database

Apply `db/migrations/0001_newsletter.sql` to the external Postgres database used by Vercel.

## Crawler

```sh
cargo run --manifest-path crawler/Cargo.toml -- collect --out crawler/data/items.json
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot public/data/newsletter-snapshot.json --out /tmp/verdun-load.sql
```

`collect` writes `crawler/data/items.json` for item loader work, `crawler/data/source-runs.json` for source-health loader work, and `public/data/newsletter-snapshot.json` as the app's static fallback when no external database is configured. The public snapshot includes item rows and source-health metadata.
`export-sql --snapshot` loads that cohesive public snapshot into SQL for external Postgres, keeping item rows and source-health rows from the same collection run. The older `--input` plus `--source-runs` path remains available for debugging split files.

For a weekly public-source pass:

```sh
cargo run --manifest-path crawler/Cargo.toml -- verify
cargo run --manifest-path crawler/Cargo.toml -- queries
cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot public/data/newsletter-snapshot.json --out /tmp/verdun-newsletter-load.sql
npm run smoke:loader -- /tmp/verdun-newsletter-load.sql public/data/newsletter-snapshot.json
```

Live collection currently supports Hacker News through the Algolia API, Lobste.rs through `newest.json`, dev.to through project-tagged public article queries, configured Medium/Substack RSS or Atom feeds, and manual JSON imports for LinkedIn/X posts. Matching uses conservative project-name/distinctive-keyword checks. `queries` prints the non-network query plan for each watched project, including HN query text, distinctive live terms, and dev.to tags. Each item carries normalized provenance in `raw_json.provenance` so downstream loaders and editorial tools can audit which adapter produced the evidence. The watchlist covers the initial AI/data projects plus functional/composable AI/data tools such as BAML, DSPy, Instructor, Ibis, and Dagster; Grust-adjacent graph, Sail/lakehouse, Arrow/DataFusion/Delta substrate, validation crates such as Garde and zod-rs, and indexing systems including Grust Sail, FalkorDB, LadybugDB, and CocoIndex. The verifier checks that the required projects, public-source adapters, publication feeds, and manual social import files are all configured before a weekly pass.

`collect --live` defaults to `--since-days 45` for live/manual source items so stale search hits do not enter the weekly queue. Use a different positive value when preparing a broader catch-up issue.

Manual social imports live at:

- `crawler/data/manual/linkedin.json`
- `crawler/data/manual/x-twitter.json`

Use those files for exported, saved, or explicitly reviewed posts rather than unauthenticated scraping. Future authenticated adapters can reuse the same normalized post shape.

## Weekly Operating Sequence

1. Run `cargo run --manifest-path crawler/Cargo.toml -- verify` and `cargo run --manifest-path crawler/Cargo.toml -- queries` before network collection to confirm the watchlist, source adapters, and search terms.
2. Run `cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2` to refresh `public/data/newsletter-snapshot.json`.
3. Run `cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot public/data/newsletter-snapshot.json --out /tmp/verdun-newsletter-load.sql`.
4. Run `npm run smoke:loader -- /tmp/verdun-newsletter-load.sql public/data/newsletter-snapshot.json` before applying SQL to the external database; it checks row counts, source-run metadata, required projects, tags, URLs, and provenance JSON.
5. Apply `/tmp/verdun-newsletter-load.sql` to the external Postgres database, then open the app at `collected.ga/rbage/` to upvote/downvote items and save this-week or ongoing focus notes.
6. Run `npm run ulysses:ready` to write the gated local Markdown export for Ulysses once readiness passes.

## Drafting for Ulysses

Build a local Markdown draft from the current public snapshot for editing and publishing with Ulysses:

```sh
npm run draft
```

The app's draft preview also exposes Markdown download and copy controls for the same shared draft builder output.

The generated article is written to `crawler/data/newsletter-draft.md` by default and includes a weekly throughline, item evidence lines from crawler provenance, source coverage gaps, plus this-week and ongoing editorial focus notes when they are present in the local snapshot; in static local mode it uses the same fallback focus as the app preview. The CLI uses the same `src/lib/newsletter.ts` draft builder as the Vue app, so the on-screen draft spine and local Markdown export stay aligned. When `crawler/data/editorial-state.json` exists, local app votes and focus notes are applied before the draft is built; set `NEWSLETTER_APPLY_LOCAL_STATE=false` to render the raw snapshot.

The app's draft preview also offers an `Editorial state` JSON download. It contains the current `{ votes, focuses }` payload in the same shape as `crawler/data/editorial-state.json`, so a browser-only review session can be audited or reused by setting `VERDUN_LOCAL_STATE_FILE` before running `npm run ulysses:ready`.

When no items are explicitly upvoted, the draft builder prefers live/manual collected items over watchlist seed placeholders and caps the fallback spine at two items per project before filling any remaining slots.

The draft renderer also rewrites thin feed snippets such as generic overviews, author labels, and crawler boilerplate into project-aware sentences before Markdown or Ghost HTML is produced.

```sh
NEWSLETTER_SNAPSHOT_FILE=https://collected.ga/api/newsletter/items npm run draft
NEWSLETTER_REQUIRE_UPVOTES=true npm run ulysses:draft
NEWSLETTER_REQUIRE_READY=true npm run ulysses:draft
npm run ulysses:ready
NEWSLETTER_DRAFT_OUT=/path/to/ulysses-import/verdun-weekly.md npm run ulysses:draft
```

The snapshot input can be a local JSON file or an `http(s)` URL such as the deployed Vercel items API. Set `NEWSLETTER_REQUIRE_UPVOTES=true` or pass `--require-upvotes` to fail instead of publishing a fallback-ranked draft when no item has been explicitly upvoted. Set `NEWSLETTER_REQUIRE_READY=true` or pass `--require-ready` to apply the same publishing readiness checks shown in the app before writing the Ulysses Markdown draft. After saving upvotes and focus notes in the app, `npm run ulysses:ready` applies both gates and writes the dated Ulysses export; it intentionally fails if the local editorial state is not ready. Without `NEWSLETTER_DRAFT_OUT`, `npm run ulysses:draft` and `npm run ulysses:ready` write a dated file under `crawler/data/ulysses/`, such as `2026-06-15-strongly-typed-ai-data-notes-june-15-2026.md`. That directory is ignored by git and is meant as the local Ulysses handoff area. Set `ULYSSES_DRAFT_DIR` to choose another export directory.

An optional Ghost helper remains available for direct API drafts from the same local snapshot, but the editorial publishing sequence is local Markdown into Ulysses:

```sh
npm run ghost:draft -- --dry-run
npm run ghost:draft -- --dry-run --require-upvotes
npm run ghost:draft -- --dry-run --require-ready

GHOST_ADMIN_API_URL=https://collected.ga \
GHOST_ADMIN_API_KEY='admin-key-id:admin-key-secret' \
npm run ghost:draft
```

`ghost:draft -- --dry-run` prints the Ghost Admin API endpoint and post payload without requiring credentials or making a network request. `ghost:draft` uses the Ghost Admin API key format directly and posts with `status=draft`. It does not publish a public post unless `GHOST_POST_STATUS` or the status argument is changed.
