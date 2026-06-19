# Verdun Crawler SDK

Verdun's Rust crawler crate is the reusable data-loading core for Verdun-backed apps. It owns the generic CLI/runtime, generic record and source-run shapes, generic SQL export, and the instance-registration trait. App-specific crawlers live outside Verdun and register themselves through `verdun_crawler::sdk`.

## Boundary

- `src/core.rs` defines reusable data types: `CrawlerSnapshot`, `NormalizedRecord`, `SourceRun`, `NormalizedCollectionPlan`, review targets, source config, and focus terms.
- `src/sdk.rs` is the public facade for app crates. External crawlers should import from `verdun_crawler::sdk`, not from `verdun_crawler::core` or `verdun_crawler::instances`.
- `src/runtime.rs` owns the shared CLI: `verify`, `queries`, `collect`, and `export-sql`.
- `src/instances/` contains only bundled Verdun proof instances. The default bundled instance is Greathouse/demo. Garbage is not bundled here.

## External App Pattern

An app crawler crate should depend on Verdun with a matching version plus a local path while the repos are developed together:

```toml
verdun-crawler = { version = "0.1.0", path = "../../../verdun/crawler" }
```

The app binary registers one or more app-owned instances:

```rust
use verdun_crawler::sdk::{CrawlerInstanceRegistration, run_cli_with_registrations};

static APP_CRAWLER_INSTANCES: &[CrawlerInstanceRegistration] = &[
    CrawlerInstanceRegistration {
        instance: &my_app::CRAWLER_INSTANCE,
        default: true,
    },
];

fn main() -> anyhow::Result<()> {
    run_cli_with_registrations(APP_CRAWLER_INSTANCES)
}
```

The instance implements `CrawlerInstance`, returns a generic `CrawlerCollection`, and may optionally implement compatibility hooks such as `legacy_sql_export` for app-specific legacy tables. Generic Verdun reload paths should use `CrawlerSnapshot` plus `export-sql` without compatibility targets.

## Generic Reload Flow

```sh
cargo run --manifest-path crawler/Cargo.toml -- collect --instance greathouse --generic-out /tmp/greathouse-snapshot.json
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot /tmp/greathouse-snapshot.json --out /tmp/verdun-load.sql --instance greathouse
npm run db:apply -- --sql /tmp/verdun-load.sql --snapshot /tmp/greathouse-snapshot.json
```

External app crates run the same CLI through their own binary and manifest path.

## Verification

From the Verdun repo:

```sh
cargo fmt --manifest-path crawler/Cargo.toml
cargo check --manifest-path crawler/Cargo.toml
cargo test --manifest-path crawler/Cargo.toml
npm run smoke:crawler-instance
```

`npm run smoke:crawler-instance` validates the bundled Greathouse/demo instance and generic export path. App-specific crawler ownership checks belong in the app repo.

