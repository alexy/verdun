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

`collect` writes both `crawler/data/items.json` for loader work and `public/data/newsletter-snapshot.json` as the app's static fallback when no external database is configured. The public snapshot includes item rows and source-health metadata.

For a weekly public-source pass:

```sh
cargo run --manifest-path crawler/Cargo.toml -- collect --live --max-live-per-project 2
```

Live collection currently supports Hacker News through the Algolia API, Lobste.rs through `newest.json`, and dev.to through the public articles API, with conservative project-name/distinctive-keyword matching. The next adapters are Medium, Substack, LinkedIn, and X/Twitter with source-specific policy checks and API credentials where required.

## Drafting and Ghost

Build a local Markdown draft from the current public snapshot:

```sh
npm run draft
```

Publish the same generated article to Ghost as a draft post:

```sh
GHOST_ADMIN_API_URL=https://collected.ga \
GHOST_ADMIN_API_KEY='admin-key-id:admin-key-secret' \
npm run ghost:draft
```

`ghost:draft` uses the Ghost Admin API key format directly and posts with `status=draft`. It does not publish a public post unless the status argument is changed.
