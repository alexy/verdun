# Verdun Crawler SDK

Verdun's Rust crawler crate is the reusable data-loading core for Verdun-backed apps. It owns the generic CLI/runtime, generic record and source-run shapes, generic SQL export, and the instance-registration trait. App-specific crawlers live outside Verdun and register themselves through `verdun_crawler::sdk`.

## Boundary

- `src/sdk.rs` is the public Rust API for app crates. It re-exports the stable generic data types, registration trait, and CLI runtime entrypoints.
- `src/core.rs` defines reusable data types internally: `CrawlerSnapshot`, `NormalizedRecord`, `SourceRun`, `NormalizedCollectionPlan`, review targets, source config, and focus terms. External crates receive these through `verdun_crawler::sdk`.
- `src/runtime.rs` owns the shared CLI internally: `verify`, `queries`, `collect`, and `export-sql`. External app binaries call it through `verdun_crawler::sdk::run_cli_with_registrations`.
- `src/instances/` contains only bundled Verdun proof crawler instances and is not a public app extension module. The current bundled crawler proof is the neutral demo; production apps run their own external crawler crates against the SDK.

## External App Pattern

An app crawler crate should depend on Verdun with a matching version plus a local path while the repos are developed together. When `verdun-crawler` is published or moved to a shared repository, remove the `path` part and keep the same `verdun_crawler::sdk` imports:

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
cargo run --manifest-path crawler/Cargo.toml -- collect --instance demo --generic-out /tmp/demo-snapshot.json
cargo run --manifest-path crawler/Cargo.toml -- export-sql --snapshot /tmp/demo-snapshot.json --out /tmp/verdun-load.sql --instance demo
npm run db:apply -- --sql /tmp/verdun-load.sql --snapshot /tmp/demo-snapshot.json
```

External app crates run the same CLI through their own binary and manifest path.

## Progress

Crawler runs emit machine-readable progress by default:

- `.codex-artifacts/crawler-progress/progress.jsonl`
- `.codex-artifacts/crawler-progress/latest.json`

Set `VERDUN_CRAWLER_PROGRESS_JSONL` or `VERDUN_CRAWLER_PROGRESS_LATEST` to route those files elsewhere. Set `VERDUN_CRAWLER_PROGRESS_STDERR=1` for a readable terminal progress line with count bars when events include totals. Set `VERDUN_CRAWLER_PROGRESS=0` to disable file emission.

Crawler runs can also persist resumable unit checkpoints through `CrawlerCheckpointStore`.
By default, checkpoint state is written to `.codex-artifacts/crawler-progress/checkpoint.json`.
Set `VERDUN_CRAWLER_CHECKPOINT_PATH` to route it elsewhere, or
`VERDUN_CRAWLER_CHECKPOINT=0` to disable checkpoint writes.

## Verification

From the Verdun repo:

```sh
cargo fmt --manifest-path crawler/Cargo.toml
cargo check --manifest-path crawler/Cargo.toml
cargo test --manifest-path crawler/Cargo.toml
npm run smoke:crawler-instance
```

`npm run smoke:crawler-instance` validates the bundled demo crawler proof and generic export path. App-specific crawler ownership checks belong in the app repo.

## Packaging Status

The crate has package metadata for local packaging checks, but publishing still needs an explicit repository URL and license or license-file decision for the extracted Verdun project. Until then, app crates should keep the version-pinned local path dependency shown above.
