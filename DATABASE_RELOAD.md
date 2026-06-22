# Database Reload Contract

Verdun owns the generic workbench database reload contract for apps that collect data outside Vercel and then load an external Postgres database used by Vercel APIs. App packages own their crawler binaries, domain-specific SQL targets, and app-specific table loaders.

## Boundary

Verdun owns:

- Generic `CrawlerSnapshot` SQL export for `instances`, `records`, `source_runs`, and `collection_plans`.
- Generic workbench migrations through `db/public/workbench-migrations.mjs`.
- Generic SQL validation and apply helpers through `scripts/public/workbench-apply-sql`.
- Generic deploy/preflight helpers through `scripts/public/deploy-workbench-database`.
- Redacted reload handoff artifacts through `scripts/public/database-reload-handoff`.

App packages own:

- Running their crawler outside Vercel.
- Source-specific collection, enrichment, scoring, and compatibility projections.
- App-specific tables, indexes, compatibility views, or spatial/search overlays.
- App-specific database load commands for those tables.
- Vercel project linking and Production environment variables.

## Environment

The database URL is read from the first configured value among:

- `POSTGRES_URL`
- `DATABASE_URL`
- `NEON_DATABASE_URL`
- `--database-url <url>`

Dry runs do not require a database URL. Apply runs require one unless the command is explicitly run in a local drill mode that skips the environment check. Handoff artifacts record only whether a database URL was present; they must not contain the URL value.

For Vercel production, configure the database URL in the app package's linked Vercel project, then redeploy the app before running strict deployed checks:

```sh
npx vercel env add POSTGRES_URL production
```

Run Vercel CLI commands from the app package directory when the app owns `.vercel/`.

## Generic Workbench Reload

Use this path when loading Verdun's reusable workbench tables.

1. Run the app-owned crawler outside Vercel and write a generic snapshot.

```sh
cargo run --manifest-path apps/example/crawler/Cargo.toml -- collect \
  --generic-out /tmp/example-generic-snapshot.json \
  --run-manifest-out /tmp/example-run-manifest.json
```

2. Export generic workbench SQL from that snapshot.

```sh
cargo run --manifest-path apps/example/crawler/Cargo.toml -- export-sql \
  --snapshot /tmp/example-generic-snapshot.json \
  --out /tmp/example-generic-load.sql \
  --instance example
```

3. Preflight the load through Verdun's generic deploy contract.

```sh
VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES=file:///absolute/path/to/apps/example/scripts/deploy-checks.mjs \
node verdun/scripts/deploy-workbench-database.mjs \
  --no-generate \
  --instance example \
  --snapshot /tmp/example-generic-snapshot.json \
  --sql /tmp/example-generic-load.sql \
  --base-path /example/ \
  --handoff-out /tmp/example-db-handoff.json
```

4. Apply only after the app's Vercel project has `POSTGRES_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL` configured.

```sh
VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES=file:///absolute/path/to/apps/example/scripts/deploy-checks.mjs \
node verdun/scripts/deploy-workbench-database.mjs \
  --no-generate \
  --apply \
  --instance example \
  --snapshot /tmp/example-generic-snapshot.json \
  --sql /tmp/example-generic-load.sql \
  --base-path /example/ \
  --handoff-out /tmp/example-db-handoff.json
```

The external profile is required for apps that are not bundled Verdun instances. It tells Verdun which deployed-check profile validates the app's base path, static snapshot, workbench APIs, and database-backed health/readiness behavior.

## App-Specific Reloads

Use app-owned commands when loading app-specific tables.

Example compatibility tables:

```sh
npm --workspace @example/app run db:deploy:compat -- --snapshot apps/example/data/compatibility-snapshot.json
npm --workspace @example/app run db:deploy:compat -- --snapshot apps/example/data/compatibility-snapshot.json --apply
```

Example domain-specific loader:

```sh
cargo run --manifest-path apps/example/crawler/Cargo.toml -- load-domain-db \
  --activate \
  --handoff-out /tmp/example-domain-db-handoff.json
```

These commands may use Verdun's redacted handoff helpers, but SQL generation, migrations, activation rules, and table semantics stay in the app package.

## Verification

Run the generic Verdun DB smokes after changing shared reload behavior:

```sh
npm run smoke:db-apply
npm run smoke:db-deploy
```

Run app-level reload smokes after changing app-specific loaders:

```sh
npm --workspace @example/app run smoke:db-deploy-handoff
npm --workspace @example/app run smoke:deploy-profile
```

For applied production loads, run the app's deployed check with database required after the Vercel deployment has the database environment configured:

```sh
npm run check:deployed -- --require-database
```

External crawlers should produce a run manifest beside the snapshot when possible. The manifest gives operators a durable record of freshness, source-run summary, and required output artifacts before a database reload is promoted.
