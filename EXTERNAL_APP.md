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

- Shared frontend controls and CSS through `@querygraph/verdun/frontend/*`.
- Generic API helpers and local adapter types through `@querygraph/verdun/api/public/*`.
- Account types, Google verification, email authentication, sessions, cookies, application/family plans, subscriptions, and plan-transition confirmations through `@querygraph/verdun/accounts/*`.
- Transactional email delivery through `@querygraph/verdun/email`.
- Generic account and workbench migrations through `@querygraph/verdun/db/public/account-migrations` and `@querygraph/verdun/db/public/workbench-migrations`.
- Deployment tooling through `@querygraph/verdun/scripts/public/check-deployed` and `@querygraph/verdun/scripts/public/deploy-profile-contract`.
- Test/workbench module loading through `@querygraph/verdun/scripts/public/test-loader` and `@querygraph/verdun/scripts/public/workbench-api-modules`.
- Rust crawler runtime and contracts through `verdun_crawler::sdk`.

## Frontend

The app owns its `index.html`, `vite.config.ts`, `src/main.ts`, domain app component, and domain styles. Import only the exported Verdun workbench pieces:

```ts
import '@querygraph/verdun/frontend/workbench-style.css'
import { WorkbenchHero, WorkbenchReviewRail } from '@querygraph/verdun/frontend/workbench-ui'
import { useWorkbenchView, type WorkbenchSnapshot } from '@querygraph/verdun/frontend/workbench-view'
```

Do not register app components inside Verdun unless the app is an intentional Verdun-owned neutral proof instance. A normal external app mounts its own entrypoint and chooses its own base path.

## API and Local Fallback

### Photo attachments

Photo selection and processing have separate browser and server exports:

```ts
import '@querygraph/verdun/frontend/photo-style.css'
import { mountPhotoPicker } from '@querygraph/verdun/frontend/photo-upload'

const picker = mountPhotoPicker(document.querySelector('#photo')!, {
  photo: savedDraft.photo,
  onChange(photo) { savedDraft.photo = photo; saveLocalDraft(savedDraft) },
  onBusyChange(busy) { submitButton.disabled = busy },
})
// Call picker.destroy() when the app removes or remounts its composer.
```

The draft has `{ imageDataUrl, imageAlt }`, uses at most 1 MiB of JPEG bytes
(base64 adds about one third), and can be restored from app-owned draft storage.
The picker has no network side effects. Apps must handle local-storage quota
errors and preserve the text draft if photo persistence is unavailable. Block
submission while `picker.isBusy()` so a pending selection cannot be skipped.

On the server, declare `sharp` in the app's dependencies and use:

```ts
import { normalizePhotoDataUrl, normalizePhotoAlt, PhotoValidationError } from '@querygraph/verdun/media/photo'

// Authenticate, check ownership and rate limits, then decode untrusted bytes.
const photo = await normalizePhotoDataUrl(body.imageDataUrl)
const imageAlt = normalizePhotoAlt(body.imageAlt)
// Persist photo.buffer with contentType photo.contentType and app-owned identity.
// PhotoValidationError exposes statusCode and code for a safe client response.
```

The server does not trust the browser draft: it bounds input before decoding,
matches declared and actual JPEG/PNG/WebP formats, rejects animations and pixel
bombs, rotates/resizes, and removes EXIF/GPS by re-encoding to WebP. Returned
dimensions, byte count, and SHA-256 describe the stored bytes. Photo descriptions
are plain text (up to 240 characters); escape them when rendering HTML. Apps
own storage policy, parent-record binding, idempotency, retries, removal, and
orphan cleanup. Never accept an arbitrary remote URL as an upload substitute.

Use Verdun's generic workbench API routes for reusable record/status/health/review/focus/state behavior. App-specific APIs, such as publishing workflows or domain enrichment, belong in the app package.

App-local fallback adapters should export neutral registration metadata and use the public type contract:

```ts
import type { LocalWorkbenchAdapterRegistration } from '@querygraph/verdun/api/public/workbench-local-adapter'
```

App route handlers should use app-local wrappers around `@querygraph/verdun/api/public/http` rather than importing Verdun `api/core/*`.

## Accounts and email authentication

Verdun owns the generic `Sign up` / `Log in` intent labels, method switching, DOM behavior, and shared scoped styles, together with the provider-neutral account, linked-identity, challenge, rate-limit, and session primitives. The external app owns where authentication is mounted, product continuation text and notes, API route shapes and adapters, the canonical completion URL, provider verification, error mapping, post-authentication behavior, and product-specific authorization.

The browser UI is framework-neutral and depends only on injected adapters:

```ts
import '@querygraph/verdun/frontend/auth-style.css'
import { mountVerdunAuth } from '@querygraph/verdun/frontend/auth-ui'

const auth = mountVerdunAuth(document.querySelector('#auth')!, {
  initialIntent: 'sign_up',
  continuations: {
    signUp: 'to contribute',
    logIn: 'to contribute again',
  },
  note: 'Your app can explain why an account is needed here.',
  adapters: {
    signUp: ({ email, password }) => appAuth.signUp(email, password),
    requestLoginCode: ({ email }) => appAuth.requestLoginCode(email),
    logInWithPassword: ({ email, password }) => appAuth.logIn(email, password),
    completeChallenge: ({ challengeId, purpose, code }) =>
      appAuth.complete(challengeId, purpose, code),
    mountGoogle: appAuth.mountGoogle,
  },
  onAuthenticated: (account) => enterApp(account),
  onNotice: (message) => showNotice(message),
  errorMessage: (error) => appErrorMessage(error),
})
```

Open `sign_up` for an acquisition flow and `log_in` for an explicit returning-user flow. Login defaults to an email code, with password as an alternative. The code method is for existing accounts only, uses `passwordless_login`, and never creates an account. Preserve Verdun's enumeration-safe challenge response rather than reporting whether an email has an account. A neutral Google mount may retain provider upsert/link behavior; Verdun's visible provider hint explains that “Continue with Google” signs up new people and logs in existing accounts.

The app may call `auth.setIntent(...)` for another explicit entry point and must call `auth.destroy()` before discarding the host. Server routes consume only the published account exports:

```ts
import {
  completeVerdunEmailChallenge,
  deliverVerdunEmailChallenge,
  requestVerdunEmailChallenge,
} from '@querygraph/verdun/accounts/email-auth'
import { verdunSessionCookie } from '@querygraph/verdun/accounts/http'
import { getEmailSender } from '@querygraph/verdun/email'
```

Apply all paths from `@querygraph/verdun/db/public/account-migrations` before enabling these routes. Pass the same server-only `VERDUN_AUTH_PEPPER` value to every Verdun email-auth operation; it must be at least 32 characters. Do not expose it to browser code or give it a `VITE_` prefix.

For a link-or-code login flow:

1. The app accepts and normalizes an email, applies any app-level abuse controls, and calls `requestVerdunEmailChallenge` with `purpose: 'passwordless_login'`, a trusted nonempty request-IP abuse key, and `authPepper: process.env.VERDUN_AUTH_PEPPER`.
2. When a challenge is returned, the app sends it with `deliverVerdunEmailChallenge`, `getEmailSender()`, a trusted canonical `appUrl`, and the app name. The message contains both a six-digit code and one-time link. The app returns the same generic response when Verdun suppresses a challenge for an ineligible address.
3. The frontend submits the challenge ID and either `{ kind: 'code', code }` or `{ kind: 'link', token }` to an app-owned completion route. Magic-link credentials are in the URL fragment rather than the query string, so the frontend must read and remove the fragment before submitting it.
4. The server calls `completeVerdunEmailChallenge` with the same purpose and pepper, sets the returned session token with `verdunSessionCookie`, and discards the raw proof. A proof can succeed only once.

Use `purpose: 'verify_email'` plus the proposed password for email/password registration. Use `purpose: 'password_reset'` plus the replacement password at completion for reset; successful reset revokes earlier sessions. `authenticateVerdunEmailPassword` handles subsequent password sign-in. Periodically call `deleteExpiredVerdunAuthArtifacts` from an app-owned maintenance job.

Google and email identities may coexist on one account. Verdun links a newly verified identity to an existing account only when both providers assert the same normalized verified email. A provider-subject/email mismatch or an identity already attached elsewhere fails as an identity conflict. Verify Google credentials with Verdun and complete the email challenge before resolving either identity; never trust an email supplied directly by the browser as proof.

Development may use Verdun's masked log sender. Production should require real delivery and provider-approved senders. For authenticated SMTP submission:

```sh
VERDUN_AUTH_PEPPER=<stable-random-secret-at-least-32-characters>
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=example-vercel@mail-host.example.net
SMTP_PASSWORD=<secret>
EMAIL_FROM_ONBOARDING='Example Onboarding <onboarding@example.com>'
EMAIL_FROM_SUPPORT='Example Support <support@example.com>'
```

Select a purpose-specific sender with `getEmailSender({ from })`. For production,
force `EMAIL_PROVIDER=smtp`; incomplete SMTP configuration then fails closed
instead of falling back to log-only delivery. Keep the canonical completion URL
in app configuration rather than deriving it from a tenant or inbound `Host`
header. See `A-SENDMAIL.md` for DNS, Sendmail, DKIM, inbound reply, and deployed
verification instructions. Resend remains supported with
`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`.

## Plans and subscriptions

Verdun's plan contract scopes commercial state by `application_key` and `family_key`. An account may therefore hold independent plans in several products, or in several plan families within one product. Consume catalog and subscription types from `@querygraph/verdun/accounts/plan-types`, SQL operations from `@querygraph/verdun/accounts/plan-store`, and confirmation delivery from `@querygraph/verdun/accounts/plan-email`.

Use a separate family whenever the same person can hold two kinds of commercial access at once. For example, Great House can register one application with a `consumer` family for ordinary property-search access and a `broker` family for listing and lead-management access. A broker subscription must not overwrite that account's consumer subscription. Great House continues to define inspection, Street View, listing, seat, and lead entitlements; Verdun stores the two catalogs and subscriptions without interpreting those app-specific keys. Curtail uses the same machinery with one `user` family and app-owned domain and short-link limits.

Apply every path from `@querygraph/verdun/db/public/account-migrations` before using the plan store. Register the application, its families, plans, and provider prices from trusted app configuration. Resolve entitlement checks from the current application/family subscription and its plan record; do not accept an application, family, account, plan, or entitlement object from the browser as an ownership override.

The store supports both manual assignments and provider-backed subscriptions. Provider webhook routes remain app-owned: verify the provider signature, resolve trusted customer/price/subscription identifiers, and pass the provider event ID and creation timestamp to the plan store. The shared store records provider events for idempotency and ignores stale updates that arrive after a newer event.

Every effective plan change records a transition with claimable confirmation-delivery state. Deliver confirmations through `@querygraph/verdun/accounts/plan-email`; the helper reads the verified account email and registered catalog names, while the app supplies the sender and an optional trusted management URL. It claims before sending and marks the transition sent, suppressed, or failed so concurrent calls do not duplicate a completed delivery.

`verdun_account.tier` remains unchanged for existing consumers. New products should use application/family subscriptions for commercial access and keep app authorization roles separate; a payment event must not implicitly grant or revoke administrative authority.

## Database

Use `@querygraph/verdun/db/public/account-migrations` for reusable accounts, identities, authentication challenges, sessions, usage, application/family plans, subscriptions, provider-event ordering, and transition-delivery state, and `@querygraph/verdun/db/public/workbench-migrations` for the reusable workbench schema. App compatibility tables or views belong under the app package and should be selected by the app's deploy profile.

The default reload path should produce generic workbench SQL for:

- `instances`
- `records`
- `source_runs`
- `collection_plans`

Compatibility targets, such as legacy app tables, should be explicit app-owned paths rather than Verdun defaults.

## Deployment Profile

An external app opts into Verdun deployment checks by exporting `deployCheckProfile` from an app-owned module and passing that module through `VERDUN_EXTERNAL_DEPLOY_CHECK_PROFILE_MODULES` when invoking `@querygraph/verdun/scripts/public/check-deployed`.

Validate the profile through the public contract:

```js
import { validateDeployCheckProfile } from '@querygraph/verdun/scripts/public/deploy-profile-contract'

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
