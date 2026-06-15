# Verdun

Verdun is the editorial desk for `collected.ga`: a Vercel/Vue app plus a Rust crawler/loader for weekly strongly typed and functional AI/data news.

The first slice mirrors the useful Greathouse shape without touching Greathouse:

- Vue/Vite app deployed by Vercel.
- Vercel serverless API routes reading an external Postgres database.
- Rust crawler/loader crate that collects watchlist items and exports SQL for the database.
- Editorial UI for upvoting/downvoting newsletter candidates and writing this-week or ongoing focus requests.

## Local app

```sh
npm install
npm run dev:app
```

Open `http://127.0.0.1:5176`.

Without `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`, the app uses the checked-in seed snapshot.

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
cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2
cargo run --manifest-path crawler/Cargo.toml -- export-sql --out /tmp/verdun-newsletter-load.sql
```

Live collection currently supports Hacker News through the Algolia API, Lobste.rs through `newest.json`, dev.to through the public articles API, configured Medium/Substack RSS or Atom feeds, and manual JSON imports for LinkedIn/X posts. Matching uses conservative project-name/distinctive-keyword checks.

Manual social imports live at:

- `crawler/data/manual/linkedin.json`
- `crawler/data/manual/x-twitter.json`

Use those files for exported, saved, or explicitly reviewed posts rather than unauthenticated scraping. Future authenticated adapters can reuse the same normalized post shape.

## Drafting for Ulysses

Build a local Markdown draft from the current public snapshot for editing and publishing with Ulysses:

```sh
npm run draft
```

The generated article is written to `crawler/data/newsletter-draft.md` by default and includes this-week and ongoing editorial focus notes when they are present in the local snapshot; in static local mode it uses the same fallback focus as the app preview.

```sh
NEWSLETTER_DRAFT_OUT=/path/to/ulysses-import/verdun-weekly.md npm run ulysses:draft
```

An optional Ghost helper remains available for direct API drafts from the same local snapshot, but the editorial publishing sequence is local Markdown into Ulysses:

```sh
GHOST_ADMIN_API_URL=https://collected.ga \
GHOST_ADMIN_API_KEY='admin-key-id:admin-key-secret' \
npm run ghost:draft
```

`ghost:draft` uses the Ghost Admin API key format directly and posts with `status=draft`. It does not publish a public post unless `GHOST_POST_STATUS` or the status argument is changed.
