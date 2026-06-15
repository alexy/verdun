# Verdun

Verdun is the editorial desk for `collected.ga/rbage/`: a Vercel/Vue app plus a Rust crawler/loader for weekly strongly typed and functional AI/data news.

The first slice mirrors the useful Greathouse shape without touching Greathouse:

- Vue/Vite app deployed by Vercel.
- Vite is built with `/rbage/` as the public base path for `collected.ga/rbage/`.
- Vercel serverless API routes reading an external Postgres database.
- Rust crawler/loader crate that collects watchlist items and exports SQL for the database.
- Editorial/public UI for upvoting/downvoting news items and writing this-week or ongoing focus requests.
- Public item cards show HN-style voting plus Strongly Typed AI credo blurbs linked to the maintained ontology panel.
- Publishing readiness checks show whether the queue has explicit editorial picks, live source/project coverage, project spread, saved focus, and healthy watched sources before local Ulysses export.
- The maintained ontology lives in `src/lib/ontology.json` and is reused by the app and local Markdown draft generation.
- The first Greathouse-style reusable Vue pieces live in `src/components/`: `AppHeader.vue` and `SourceHealthPanel.vue`.
- Backend route mechanics live in `api/newsletter/_http.ts`, while data access and local fallback state stay in `api/newsletter/_db.ts`, matching the Greathouse-style reusable backend boundary.

## Local app

```sh
npm install
npm run dev:app
```

Open `http://127.0.0.1:5176`.

Without `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`, the app uses the checked-in seed snapshot.
Local votes and focus notes are persisted to ignored `crawler/data/editorial-state.json` so the triage workflow survives refreshes before an external database is configured. Set `VERDUN_LOCAL_STATE_FILE` to use a different local state file.

## Database

Apply `db/migrations/0001_newsletter.sql` to the external Postgres database used by Vercel.

## Crawler

```sh
cargo run --manifest-path crawler/Cargo.toml -- collect --out crawler/data/items.json
cargo run --manifest-path crawler/Cargo.toml -- export-sql --input crawler/data/items.json --out /tmp/verdun-load.sql
```

`collect` writes `crawler/data/items.json` for item loader work, `crawler/data/source-runs.json` for source-health loader work, and `public/data/newsletter-snapshot.json` as the app's static fallback when no external database is configured. The public snapshot includes item rows and source-health metadata.

For a weekly public-source pass:

```sh
cargo run --manifest-path crawler/Cargo.toml -- verify
cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2
cargo run --manifest-path crawler/Cargo.toml -- export-sql --out /tmp/verdun-newsletter-load.sql
```

Live collection currently supports Hacker News through the Algolia API, Lobste.rs through `newest.json`, dev.to through the public articles API, configured Medium/Substack RSS or Atom feeds, and manual JSON imports for LinkedIn/X posts. Matching uses conservative project-name/distinctive-keyword checks. The watchlist covers the initial AI/data projects plus Grust-adjacent graph, Sail/lakehouse, and indexing systems including Grust Sail, FalkorDB, LadybugDB, and CocoIndex. The verifier checks that the required projects, public-source adapters, publication feeds, and manual social import files are all configured before a weekly pass.

Manual social imports live at:

- `crawler/data/manual/linkedin.json`
- `crawler/data/manual/x-twitter.json`

Use those files for exported, saved, or explicitly reviewed posts rather than unauthenticated scraping. Future authenticated adapters can reuse the same normalized post shape.

## Drafting for Ulysses

Build a local Markdown draft from the current public snapshot for editing and publishing with Ulysses:

```sh
npm run draft
```

The generated article is written to `crawler/data/newsletter-draft.md` by default and includes this-week and ongoing editorial focus notes when they are present in the local snapshot; in static local mode it uses the same fallback focus as the app preview. The CLI uses the same `src/lib/newsletter.ts` draft builder as the Vue app, so the on-screen draft spine and local Markdown export stay aligned. When `crawler/data/editorial-state.json` exists, local app votes and focus notes are applied before the draft is built; set `NEWSLETTER_APPLY_LOCAL_STATE=false` to render the raw snapshot.

```sh
NEWSLETTER_SNAPSHOT_FILE=https://collected.ga/api/newsletter/items npm run draft
NEWSLETTER_REQUIRE_UPVOTES=true npm run ulysses:draft
NEWSLETTER_DRAFT_OUT=/path/to/ulysses-import/verdun-weekly.md npm run ulysses:draft
```

The snapshot input can be a local JSON file or an `http(s)` URL such as the deployed Vercel items API. Set `NEWSLETTER_REQUIRE_UPVOTES=true` or pass `--require-upvotes` to fail instead of publishing a fallback-ranked draft when no item has been explicitly upvoted. Without `NEWSLETTER_DRAFT_OUT`, `npm run ulysses:draft` writes a dated file under `crawler/data/ulysses/`, such as `2026-06-15-strongly-typed-ai-data-notes-june-15-2026.md`. That directory is ignored by git and is meant as the local Ulysses handoff area. Set `ULYSSES_DRAFT_DIR` to choose another export directory.

An optional Ghost helper remains available for direct API drafts from the same local snapshot, but the editorial publishing sequence is local Markdown into Ulysses:

```sh
npm run ghost:draft -- --dry-run
npm run ghost:draft -- --dry-run --require-upvotes

GHOST_ADMIN_API_URL=https://collected.ga \
GHOST_ADMIN_API_KEY='admin-key-id:admin-key-secret' \
npm run ghost:draft
```

`ghost:draft -- --dry-run` prints the Ghost Admin API endpoint and post payload without requiring credentials or making a network request. `ghost:draft` uses the Ghost Admin API key format directly and posts with `status=draft`. It does not publish a public post unless `GHOST_POST_STATUS` or the status argument is changed.
