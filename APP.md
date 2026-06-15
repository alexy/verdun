# Verdun App State

## Goal

Build a newsletter generator for strongly typed and functional AI/data news. The deployed Vercel app should show candidate news items, allow upvote/downvote editorial triage, accept text requests for what to collect more of, and later publish polished weekly updates through the Ghost API to `collected.ga`.

## Current Slice

- Vue/Vite app with a newsroom triage interface.
- Vercel API routes:
  - `GET /api/newsletter/items`
  - `POST /api/newsletter/vote`
  - `POST /api/newsletter/focus`
- External Postgres schema in `db/migrations/0001_newsletter.sql`.
- Rust crawler/loader scaffold under `crawler/`.
- Seed fallback includes Pydantic, LakeSail, Turso, LanceDB, HelixDB, SurrealDB, pgGraph, and related strongly typed data-system themes.

## Next Work

- Add live source adapters for Hacker News and Lobste.rs first because they have straightforward public fetch paths.
- Add authenticated or policy-aware adapters for dev.to, Medium, Substack, LinkedIn, and X/Twitter.
- Add newsletter draft generation and Ghost API publishing.
- Extract shared UI/API/crawler modules back into Greathouse after the Verdun shape stabilizes.
