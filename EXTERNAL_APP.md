# External Verdun App Guide

Use this when building a product app on top of Verdun. Verdun should provide the reusable Vercel workbench, database, deployment, and crawler contracts; the app should own its product UI, domain crawler, publishing workflow, deployment profile, and compatibility surfaces.

## App Package Shape

An external app package should own:

- Vite entrypoint, app shell, domain components, and app CSS.
- App-specific Vercel routes and local fallback adapters.
- Domain crawler crate and crawler config.
- Deploy-check profile and any readiness or draft checks.
- App-owned generated data, local editorial state, publishing scripts, and compatibility SQL.

The app should consume Verdun only through the public surface in `PUBLIC_SURFACE.md`:

- Shared frontend controls and CSS through `verdun/frontend/*`.
- Generic API helpers and local adapter types through `verdun/api/public/*`.
- Generic workbench migrations through `verdun/db/public/workbench-migrations`.
- Deployment tooling through `verdun/scripts/public/check-deployed` and `verdun/scripts/public/deploy-profile-contract`.
- Test/workbench module loading through `verdun/scripts/public/test-loader` and `verdun/scripts/public/workbench-api-modules`.
- Rust crawler runtime and contracts through `verdun_crawler::sdk`.

## Frontend

The app owns its `index.html`, `vite.config.ts`, `src/main.ts`, domain app component, and domain styles. Import only the exported Verdun workbench pieces:

```ts
import 'verdun/frontend/workbench-style.css'
import { WorkbenchHero, WorkbenchReviewRail } from 'verdun/frontend/workbench-ui'
import { useWorkbenchView, type WorkbenchSnapshot } from 'verdun/frontend/workbench-view'
```

Do not register app components inside Verdun unless the app is an intentional Verdun-owned neutral proof instance. A normal external app mounts its own entrypoint and chooses its own base path.

## API and Local Fallback

Use Verdun's generic workbench API routes for reusable record/status/health/review/focus/state behavior. App-specific APIs, such as publishing workflows or domain enrichment, belong in the app package.

App-local fallback adapters should export neutral registration metadata and use the public type contract:

```ts
import type { LocalWorkbenchAdapterRegistration } from 'verdun/api/public/workbench-local-adapter'
```

App route handlers should use app-local wrappers around `verdun/api/public/http` rather than importing Verdun `api/core/*`.

## Database

Use `verdun/db/public/workbench-migrations` for the reusable workbench schema. App compatibility tables or views belong under the app package and should be selected by the app's deploy profile.

The default reload path should produce generic workbench SQL for:

- `instances`
- `records`
- `source_runs`
- `collection_plans`

Compatibility targets, such as legacy app tables, should be explicit app-owned paths rather than Verdun defaults.

## Deployment Profile

An external app opts into Verdun deployment checks by exporting `deployCheckProfile` from an app-owned module and passing that module through `VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES` when invoking `verdun/scripts/public/check-deployed`.

Validate the profile through the public contract:

```js
import { validateDeployCheckProfile } from 'verdun/scripts/public/deploy-profile-contract'

export const deployCheckProfile = validateDeployCheckProfile({
  id: 'example',
  default: true,
  defaultBaseUrl: 'https://example.com/example/',
  basePath: '/example/',
  staticSnapshotPath: 'data/example-snapshot.json',
  sourceSnapshotPath: '/absolute/path/to/app/data/example-snapshot.json',
  migrationPaths: [
    '/absolute/path/to/app/db/compatibility.sql',
  ],
  smokeCommands: ['example:smoke:app'],
  smokeAllCommands: ['example:smoke:workbench'],
}, 'Example deploy-check profile')
```

Use profile hooks for app-specific readiness or draft checks. Verdun's generic deployment checker should validate only the reusable app route, static snapshot, workbench records/status/health APIs, and declared profile hooks.

## Crawler

The app crawler crate owns domain adapters and registers them with Verdun's SDK:

```rust
use verdun_crawler::sdk::{run_cli_with_registrations, CrawlerInstanceRegistration};

mod instances;

fn main() {
    let instances: &[CrawlerInstanceRegistration] = &[instances::example::CRAWLER_INSTANCE];
    if let Err(error) = run_cli_with_registrations(instances) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
```

The app crawler should emit `NormalizedRecord`, `SourceRun`, and `NormalizedCollectionPlan` values through the SDK. Domain-specific payloads can be preserved in `raw_json`, but the generic reload path should not require Verdun to know the app's legacy item type.

## Checks

A healthy external app should have app-owned checks for:

- Manifest/path ownership.
- App build and browser smoke.
- Workbench projection/fallback behavior.
- Crawler verify, query-plan, collection, provenance, and SQL export.
- Generic database load validation.
- Deployment check wrapper.
- Any app-specific publishing/readiness gates.

Verdun's own smokes should validate Verdun's bundled proof instance and public contracts. App ownership checks belong in the external app package.
