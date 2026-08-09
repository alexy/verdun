import { access, readFile } from 'node:fs/promises'

const expectedExports = {
  './package.json': './package.json',
  './accounts/account-types': {
    types: './lib/src/accounts/account-types.d.ts',
    default: './lib/src/accounts/account-types.js',
  },
  './accounts/email-auth': {
    types: './lib/src/accounts/email-auth.d.ts',
    default: './lib/src/accounts/email-auth.js',
  },
  './accounts/google': {
    types: './lib/src/accounts/google.d.ts',
    default: './lib/src/accounts/google.js',
  },
  './accounts/http': {
    types: './lib/src/accounts/http.d.ts',
    default: './lib/src/accounts/http.js',
  },
  './accounts/plan-email': {
    types: './lib/src/accounts/plan-email.d.ts',
    default: './lib/src/accounts/plan-email.js',
  },
  './accounts/plan-store': {
    types: './lib/src/accounts/plan-store.d.ts',
    default: './lib/src/accounts/plan-store.js',
  },
  './accounts/plan-types': {
    types: './lib/src/accounts/plan-types.d.ts',
    default: './lib/src/accounts/plan-types.js',
  },
  './accounts/store': {
    types: './lib/src/accounts/store.d.ts',
    default: './lib/src/accounts/store.js',
  },
  './accounts/workspaces': {
    types: './lib/src/accounts/workspaces.d.ts',
    default: './lib/src/accounts/workspaces.js',
  },
  './domains/vercel': {
    types: './lib/src/domains/vercel.d.ts',
    default: './lib/src/domains/vercel.js',
  },
  './api/public/http': {
    types: './lib/api/public/http.d.ts',
    default: './lib/api/public/http.js',
  },
  './api/public/workbench-local-adapter': {
    types: './lib/api/public/workbench-local-adapter.d.ts',
    default: './lib/api/public/workbench-local-adapter.js',
  },
  './db/public/account-migrations': './db/public/account-migrations.mjs',
  './db/public/workbench-migrations': './db/public/workbench-migrations.mjs',
  './frontend/workbench-style.css': './frontend/workbench-style.css',
  './frontend/workbench-ui': './frontend/workbench-ui.ts',
  './frontend/workbench-view': './frontend/workbench-view.ts',
  './scripts/public/check-deployed': './scripts/public/check-deployed.mjs',
  './scripts/public/database-reload-handoff': './scripts/public/database-reload-handoff.mjs',
  './scripts/public/deploy-workbench-database': './scripts/public/deploy-workbench-database.mjs',
  './scripts/public/deploy-profile-contract': './scripts/public/deploy-profile-contract.mjs',
  './scripts/public/test-loader': './scripts/public/test-loader.mjs',
  './scripts/public/workbench-apply-sql': './scripts/public/workbench-apply-sql.mjs',
  './scripts/public/workbench-api-modules': './scripts/public/workbench-api-modules.mjs',
  './email': {
    types: './lib/api/core/email.d.ts',
    default: './lib/api/core/email.js',
  },
  './svix': {
    types: './lib/api/core/svix.d.ts',
    default: './lib/api/core/svix.js',
  },
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const documentedSurface = await readFile('PUBLIC_SURFACE.md', 'utf8')

const actualExports = packageJson.exports ?? {}
const expectedKeys = Object.keys(expectedExports).sort()
const actualKeys = Object.keys(actualExports).sort()

if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
  throw new Error(`Verdun package exports drifted from PUBLIC_SURFACE.md\nexpected: ${expectedKeys.join(', ')}\nactual: ${actualKeys.join(', ')}`)
}

for (const [subpath, target] of Object.entries(expectedExports)) {
  if (typeof target === 'string') {
    if (actualExports[subpath] !== target) {
      throw new Error(`Verdun export ${subpath} should point at ${target}, found ${actualExports[subpath]}`)
    }
    await access(target.replace(/^\.\//, ''))
  } else {
    const actualTarget = actualExports[subpath]
    if (!actualTarget || typeof actualTarget !== 'object') {
      throw new Error(`Verdun export ${subpath} should be a conditional export object`)
    }
    for (const [condition, conditionTarget] of Object.entries(target)) {
      if (actualTarget[condition] !== conditionTarget) {
        throw new Error(`Verdun export ${subpath}.${condition} should point at ${conditionTarget}, found ${actualTarget[condition]}`)
      }
      await access(conditionTarget.replace(/^\.\//, ''))
    }
  }

  const publicImport = `verdun/${subpath.replace(/^\.\//, '')}`
  if (!documentedSurface.includes(publicImport)) {
    throw new Error(`PUBLIC_SURFACE.md does not document ${publicImport}`)
  }
}

if (packageJson.scripts?.['smoke:account-store'] !== 'node scripts/smoke-account-store.mjs') {
  throw new Error('package.json must expose smoke:account-store for the public account store contract')
}
if (packageJson.scripts?.['smoke:email-auth'] !== 'node scripts/smoke-email-auth.mjs') {
  throw new Error('package.json must expose smoke:email-auth for the public email auth contract')
}
if (packageJson.scripts?.['smoke:email-auth-postgres'] !== 'node scripts/smoke-email-auth-postgres.mjs') {
  throw new Error('package.json must expose smoke:email-auth-postgres for real PostgreSQL auth coverage')
}
if (packageJson.scripts?.['smoke:plans'] !== 'node scripts/smoke-plans.mjs') {
  throw new Error('package.json must expose smoke:plans for the public application-plan contract')
}
if (packageJson.scripts?.['smoke:vercel-domains'] !== 'node scripts/smoke-vercel-domains.mjs') {
  throw new Error('package.json must expose smoke:vercel-domains for the public Vercel project-domain contract')
}

for (const forbidden of ['verdun/src/core/', 'verdun/api/core/', 'verdun/db/core/', 'verdun/scripts/core/']) {
  if (!documentedSurface.includes(forbidden)) {
    throw new Error(`PUBLIC_SURFACE.md should explicitly tell apps not to import ${forbidden}`)
  }
}

if (!documentedSurface.includes('verdun_crawler::sdk')) {
  throw new Error('PUBLIC_SURFACE.md does not document the Rust crawler SDK facade')
}

const accountTypesSource = await readFile('src/accounts/account-types.ts', 'utf8')
for (const expectedSymbol of ['VerdunAccountTier', 'VerdunAccountStatus', 'VerdunIdentityProvider', 'VerdunAccount', 'VerdunTierCapabilities', 'verdunTierCapabilities', 'verdunCapabilitiesForTier']) {
  if (!accountTypesSource.includes(expectedSymbol)) {
    throw new Error(`src/accounts/account-types.ts does not export ${expectedSymbol}`)
  }
}
for (const expectedTier of ["'free'", "'buyer'", "'pro'", "'admin'"]) {
  if (!accountTypesSource.includes(expectedTier)) {
    throw new Error(`src/accounts/account-types.ts does not define account tier ${expectedTier}`)
  }
}

const googleSource = await readFile('src/accounts/google.ts', 'utf8')
for (const expectedSymbol of ['GoogleIdentityProfile', 'verifyGoogleCredential']) {
  if (!googleSource.includes(expectedSymbol)) {
    throw new Error(`src/accounts/google.ts does not export ${expectedSymbol}`)
  }
}

const emailAuthSource = await readFile('src/accounts/email-auth.ts', 'utf8')
for (const expectedSymbol of ['requestVerdunEmailChallenge', 'deliverVerdunEmailChallenge', 'completeVerdunEmailChallenge', 'authenticateVerdunEmailPassword', 'listVerdunAccountIdentities', 'hashVerdunPassword', 'verifyVerdunPassword']) {
  if (!emailAuthSource.includes(expectedSymbol)) {
    throw new Error(`src/accounts/email-auth.ts does not export ${expectedSymbol}`)
  }
}

const accountHttpSource = await readFile('src/accounts/http.ts', 'utf8')
for (const expectedSymbol of ['verdunAccountCookieName', 'verdunDefaultSessionMaxAgeSeconds', 'verdunSessionCookie', 'clearVerdunSessionCookie', 'verdunCookieValue', 'isVerdunAccountTier']) {
  if (!accountHttpSource.includes(expectedSymbol)) {
    throw new Error(`src/accounts/http.ts does not export ${expectedSymbol}`)
  }
}

const accountStoreSource = await readFile('src/accounts/store.ts', 'utf8')
for (const expectedSymbol of ['verdunAccountDatabaseUrl', 'verdunAccountSql', 'upsertVerdunGoogleAccount', 'createVerdunAccountSession', 'revokeVerdunAccountSession', 'deleteExpiredVerdunAccountSessions', 'currentVerdunAccount', 'verdunAccountUsage', 'recordVerdunAccountUsage', 'hashVerdunSessionToken', 'verdunAccountFromRow']) {
  if (!accountStoreSource.includes(expectedSymbol)) {
    throw new Error(`src/accounts/store.ts does not export ${expectedSymbol}`)
  }
}

const planTypesSource = await readFile('src/accounts/plan-types.ts', 'utf8')
for (const expectedSymbol of [
  'VerdunApplication',
  'VerdunPlanFamily',
  'VerdunPlan',
  'VerdunPlanPrice',
  'VerdunBillingCustomer',
  'VerdunSubscription',
  'VerdunSubscriptionStatus',
  'VerdunPlanTransition',
  'VerdunPlanTransitionDeliveryState',
  'VerdunResolvedPlan',
  'normalizeVerdunPlanIdentifier',
  'normalizeVerdunPlanDisplayName',
  'normalizeVerdunPlanDescription',
  'normalizeVerdunPlanProviderId',
  'normalizeVerdunPlanCurrency',
  'normalizeVerdunPlanJsonObject',
  'normalizeVerdunPlanDate',
  'isVerdunSubscriptionStatus',
  'isVerdunPlanTransitionDeliveryState',
]) {
  if (!planTypesSource.includes(expectedSymbol)) {
    throw new Error(`src/accounts/plan-types.ts does not export ${expectedSymbol}`)
  }
}

const planStoreSource = await readFile('src/accounts/plan-store.ts', 'utf8')
for (const expectedSymbol of [
  'upsertVerdunApplication',
  'upsertVerdunPlanFamily',
  'upsertVerdunPlan',
  'upsertVerdunPlanPrice',
  'upsertVerdunBillingCustomer',
  'verdunBillingCustomerByProviderId',
  'assignVerdunManualPlan',
  'upsertVerdunProviderSubscription',
  'resolveVerdunAccountPlan',
  'verdunPlanTransition',
  'listVerdunPlanTransitions',
  'claimVerdunPlanTransitionConfirmation',
  'markVerdunPlanTransitionConfirmation',
]) {
  if (!planStoreSource.includes(expectedSymbol)) {
    throw new Error(`src/accounts/plan-store.ts does not export ${expectedSymbol}`)
  }
}

const planEmailSource = await readFile('src/accounts/plan-email.ts', 'utf8')
for (const expectedSymbol of ['verdunPlanTransitionEmail', 'deliverVerdunPlanTransitionConfirmation']) {
  if (!planEmailSource.includes(expectedSymbol)) {
    throw new Error(`src/accounts/plan-email.ts does not export ${expectedSymbol}`)
  }
}

const vercelDomainsSource = await readFile('src/domains/vercel.ts', 'utf8')
for (const expectedSymbol of [
  'VercelProjectDomainsConfig',
  'VercelProjectDomain',
  'VercelDomainSnapshot',
  'VercelProjectDomainsError',
  'VercelProjectDomains',
]) {
  if (!vercelDomainsSource.includes(expectedSymbol)) {
    throw new Error(`src/domains/vercel.ts does not export ${expectedSymbol}`)
  }
}

const accountMigrations = await import('../db/public/account-migrations.mjs')
if (!Array.isArray(accountMigrations.publicAccountMigrationPaths) || accountMigrations.publicAccountMigrationPaths.length !== 5) {
  throw new Error('db/public/account-migrations.mjs must expose the reusable Verdun account migration manifest')
}
const accountMigrationSource = await readFile(accountMigrations.publicAccountMigrationPaths[0], 'utf8')
for (const requiredAccountSchemaFragment of ['create table if not exists verdun_account', 'create table if not exists verdun_account_session', 'create table if not exists verdun_account_usage', 'create table if not exists verdun_account_usage_subject', "tier text not null default 'free'", "provider text not null default 'google'", "status text not null default 'active'", 'unique (provider, provider_subject)', 'references verdun_account(id) on delete cascade']) {
  if (!accountMigrationSource.includes(requiredAccountSchemaFragment)) {
    throw new Error(`Verdun account migration is missing ${requiredAccountSchemaFragment}`)
  }
}
const identityMigrationSource = await readFile(accountMigrations.publicAccountMigrationPaths[1], 'utf8')
for (const requiredIdentitySchemaFragment of ['create table if not exists verdun_account_identity', 'create table if not exists verdun_auth_challenge', 'create table if not exists verdun_auth_rate_bucket', 'verdun_issue_email_challenge', 'verdun_resolve_account_identity', 'verdun_complete_email_challenge', "provider in ('google', 'email')", 'unique (account_id, provider)']) {
  if (!identityMigrationSource.includes(requiredIdentitySchemaFragment)) {
    throw new Error(`Verdun multi-identity migration is missing ${requiredIdentitySchemaFragment}`)
  }
}
const linkedInMigrationPath = accountMigrations.publicAccountMigrationPaths[4]
if (!linkedInMigrationPath.endsWith('0008_linkedin_identity.sql')) throw new Error(`Verdun LinkedIn migration should be 0008_linkedin_identity.sql, found ${linkedInMigrationPath}`)
const linkedInMigrationSource = await readFile(linkedInMigrationPath, 'utf8')
for (const requiredLinkedInFragment of ["provider in ('google', 'linkedin', 'email')", 'verdun_resolve_account_identity', "p_provider in (''google'', ''linkedin'')"]) {
  if (!linkedInMigrationSource.includes(requiredLinkedInFragment)) throw new Error(`LinkedIn identity migration is missing ${requiredLinkedInFragment}`)
}
const planMigrationPath = accountMigrations.publicAccountMigrationPaths[2]
if (!planMigrationPath.endsWith('0006_application_plans.sql')) {
  throw new Error(`Verdun application-plan migration should be 0006_application_plans.sql, found ${planMigrationPath}`)
}
const workspaceMigrationPath = accountMigrations.publicAccountMigrationPaths[3]
if (!workspaceMigrationPath.endsWith('0007_workspaces.sql')) {
  throw new Error(`Verdun workspace migration should be 0007_workspaces.sql, found ${workspaceMigrationPath}`)
}
const planMigrationSource = await readFile(planMigrationPath, 'utf8')
for (const requiredPlanSchemaFragment of [
  'legacy verdun_account.tier',
  'create table if not exists verdun_application',
  'create table if not exists verdun_plan_family',
  'create table if not exists verdun_plan (',
  'create table if not exists verdun_plan_price',
  'create table if not exists verdun_billing_customer',
  'create table if not exists verdun_subscription (',
  'create table if not exists verdun_subscription_provider_event',
  'create table if not exists verdun_plan_transition',
  'entitlements jsonb not null',
  "source text not null check (source in ('manual', 'provider'))",
  'unique (application_key, account_id, family_key)',
  "outcome in ('processing', 'applied', 'stale', 'failed')",
  'confirmation_delivery_state',
  'confirmation_delivery_attempts',
  'verdun_plan_transition_delivery_idx',
]) {
  if (!planMigrationSource.includes(requiredPlanSchemaFragment)) {
    throw new Error(`Verdun application-plan migration is missing ${requiredPlanSchemaFragment}`)
  }
}

const { validateDeployCheckProfile } = await import('./public/deploy-profile-contract.mjs')
validateDeployCheckProfile({
  id: 'surface-smoke',
  basePath: '/surface-smoke/',
  defaultBaseUrl: 'https://example.com/surface-smoke/',
  staticSnapshotPath: 'data/surface-smoke.json',
  accountMigrationCommand: 'surface:account:db:apply -- --apply --verify-after',
  accountReadinessCommand: 'surface:account:readiness -- --strict --verify-db',
  accountSessionCleanupCommand: 'surface:account:sessions:cleanup -- --apply',
  accountLiveEnvCommand: 'surface:account:live-env -- --strict',
  accountLiveAcceptanceCommand: 'surface:account:live-acceptance -- --execute-live-check',
  accountLiveCheckCommand: 'surface:account:live-check -- --base-url <deployment-url>',
}, 'public-surface smoke profile')

try {
  validateDeployCheckProfile({ id: 'bad-profile', basePath: 'bad' }, 'bad public-surface smoke profile')
  throw new Error('deploy profile contract accepted an invalid basePath')
} catch (error) {
  if (!String(error?.message ?? error).includes('basePath')) throw error
}

try {
  validateDeployCheckProfile({
    id: 'bad-account-live-acceptance',
    basePath: '/bad-account-live-acceptance/',
    accountLiveAcceptanceCommand: '',
  }, 'bad public-surface smoke profile')
  throw new Error('deploy profile contract accepted an empty accountLiveAcceptanceCommand')
} catch (error) {
  if (!String(error?.message ?? error).includes('accountLiveAcceptanceCommand')) throw error
}

try {
  validateDeployCheckProfile({
    id: 'bad-account-migration',
    basePath: '/bad-account-migration/',
    accountMigrationCommand: '',
  }, 'bad public-surface smoke profile')
  throw new Error('deploy profile contract accepted an empty accountMigrationCommand')
} catch (error) {
  if (!String(error?.message ?? error).includes('accountMigrationCommand')) throw error
}

const workbenchViewSource = await readFile('frontend/workbench-view.ts', 'utf8')
for (const expectedSymbol of ['useWorkbenchView', 'WorkbenchSnapshot', 'WorkbenchRecord', 'ReviewValue']) {
  if (!workbenchViewSource.includes(expectedSymbol)) {
    throw new Error(`frontend/workbench-view.ts does not export ${expectedSymbol}`)
  }
}

const workbenchApiModules = await import('./public/workbench-api-modules.mjs')
for (const expectedSymbol of ['publicWorkbenchApiModulePaths', 'publicWorkbenchApiSourceGuardPaths']) {
  if (!workbenchApiModules[expectedSymbol]) {
    throw new Error(`scripts/public/workbench-api-modules.mjs does not export ${expectedSymbol}`)
  }
}
if ('publicBundledProofModulePaths' in workbenchApiModules) {
  throw new Error('scripts/public/workbench-api-modules.mjs should not expose bundled proof modules to external apps')
}

const reloadHandoff = await import('./public/database-reload-handoff.mjs')
for (const expectedSymbol of ['cargoRunCommand', 'databaseEnvStatus', 'databaseReloadHandoff', 'databaseReloadStatus', 'nodeApplySqlCommand', 'redactedDatabaseUrlArg', 'writeDatabaseReloadHandoff']) {
  if (typeof reloadHandoff[expectedSymbol] !== 'function') {
    throw new Error(`scripts/public/database-reload-handoff.mjs does not export ${expectedSymbol}`)
  }
}
if (reloadHandoff.databaseEnvStatus('postgres://example') !== 'provided') {
  throw new Error('database reload handoff helper did not report provided database env')
}
if (JSON.stringify(reloadHandoff.redactedDatabaseUrlArg('postgres://example')) !== JSON.stringify(['--database-url', '<redacted>'])) {
  throw new Error('database reload handoff helper did not redact database URL args')
}
if (JSON.stringify(reloadHandoff.cargoRunCommand('crawler/Cargo.toml', ['export-sql'])) !== JSON.stringify(['cargo', 'run', '--manifest-path', 'crawler/Cargo.toml', '--', 'export-sql'])) {
  throw new Error('database reload handoff helper did not build cargo run command')
}
const nodeApply = reloadHandoff.nodeApplySqlCommand({
  scriptPath: 'scripts/apply.mjs',
  leadingArgs: ['--instance', 'surface-smoke'],
  sqlPath: '/tmp/surface-smoke.sql',
  snapshotPath: '/tmp/surface-smoke.json',
  trailingArgs: ['--loader', 'strict'],
  databaseUrl: 'postgres://example',
  apply: true,
})
if (JSON.stringify(nodeApply) !== JSON.stringify(['node', 'scripts/apply.mjs', '--instance', 'surface-smoke', '--sql', '/tmp/surface-smoke.sql', '--snapshot', '/tmp/surface-smoke.json', '--loader', 'strict', '--database-url', '<redacted>', '--apply'])) {
  throw new Error(`database reload handoff helper did not build redacted node apply command: ${JSON.stringify(nodeApply)}`)
}
const surfaceHandoff = reloadHandoff.databaseReloadHandoff({
  apply: false,
  kind: 'surface_smoke_database_reload',
  instance: 'surface-smoke',
  generatedSql: true,
  snapshotPath: '/tmp/surface-smoke.json',
  sqlPath: '/tmp/surface-smoke.sql',
  databaseUrl: 'postgres://example',
  vercelEnvChecked: false,
  deployedCheckSkipped: true,
  deployedCheckCommand: ['npm', 'run', 'check:deployed', '--', '--require-database'],
  commands: {
    exportSql: ['surface', 'export'],
    applySql: ['surface', 'apply', '--database-url', '<redacted>'],
  },
  extra: {
    basePath: '/surface-smoke/',
  },
})
if (
  surfaceHandoff.schemaVersion !== 1 ||
  surfaceHandoff.status !== 'preflight' ||
  surfaceHandoff.databaseEnv !== 'provided' ||
  surfaceHandoff.basePath !== '/surface-smoke/' ||
  surfaceHandoff.deployedCheck?.skipped !== true
) {
  throw new Error(`database reload handoff constructor returned an unexpected shape: ${JSON.stringify(surfaceHandoff)}`)
}
