# verdun-cli

`verdun` is the public mothership CLI for Verdun-backed applications. It owns
portable token-profile persistence and neutral database, crawler, and account
reporting. Product CLIs can reuse the `verdun_cli` library while retaining
their own commands and API routes.

Consumers should pin a released semver version from crates.io rather than a
Git or sibling-path dependency. That gives every product CLI a fixed, tested
Verdun base; it upgrades only when its maintainer deliberately selects and
validates a newer `verdun-cli` release.

```sh
cargo run -p verdun-cli -- login --token "$VERDUN_TOKEN" --api-base https://app.example
cargo run -p verdun-cli -- report
cargo run -p verdun-cli -- account ls
```

Profiles are stored in the platform config directory at `verdun/config.toml`.
Tokens are never printed by `config` or `account ls`.

The report uses Verdun's public workbench health endpoint by default:
`/api/workbench/health`. An application can use a different compatible endpoint
with `--health-path`; its JSON must include the documented `databaseConfigured`,
`activeSnapshot`, and optional account fields.
