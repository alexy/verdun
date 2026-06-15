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

The crawler starts with a curated watchlist for Pydantic, LakeSail, Turso, LanceDB, HelixDB, SurrealDB, pgGraph, Grust, TypeSec, and related sources. The next step is to add live adapters for Hacker News, Lobste.rs, dev.to, Medium, Substack, LinkedIn, and X/Twitter with source-specific policy checks and API credentials where required.
