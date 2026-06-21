import { access, readFile } from 'node:fs/promises'

const expectedExports = {
  './accounts/account-types': './src/accounts/account-types.ts',
  './accounts/google': './src/accounts/google.ts',
  './accounts/http': './src/accounts/http.ts',
  './accounts/store': './src/accounts/store.ts',
  './api/public/http': './api/public/http.ts',
  './api/public/workbench-local-adapter': './api/public/workbench-local-adapter.ts',
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
  if (actualExports[subpath] !== target) {
    throw new Error(`Verdun export ${subpath} should point at ${target}, found ${actualExports[subpath]}`)
  }
  await access(target.replace(/^\.\//, ''))

  const publicImport = `verdun/${subpath.replace(/^\.\//, '')}`
  if (!documentedSurface.includes(publicImport)) {
    throw new Error(`PUBLIC_SURFACE.md does not document ${publicImport}`)
  }
}

if (packageJson.scripts?.['smoke:account-store'] !== 'node scripts/smoke-account-store.mjs') {
  throw new Error('package.json must expose smoke:account-store for the public account store contract')
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
for (const expectedSymbol of ['VerdunAccountTier', 'VerdunAccountStatus', 'VerdunAccount', 'VerdunTierCapabilities', 'verdunTierCapabilities', 'verdunCapabilitiesForTier']) {
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

const accountMigrations = await import('../db/public/account-migrations.mjs')
if (!Array.isArray(accountMigrations.publicAccountMigrationPaths) || accountMigrations.publicAccountMigrationPaths.length !== 1) {
  throw new Error('db/public/account-migrations.mjs must expose the reusable Verdun account migration manifest')
}
const accountMigrationSource = await readFile(accountMigrations.publicAccountMigrationPaths[0], 'utf8')
for (const requiredAccountSchemaFragment of ['create table if not exists verdun_account', 'create table if not exists verdun_account_session', 'create table if not exists verdun_account_usage', 'create table if not exists verdun_account_usage_subject', "tier text not null default 'free'", "provider text not null default 'google'", "status text not null default 'active'", 'unique (provider, provider_subject)', 'references verdun_account(id) on delete cascade']) {
  if (!accountMigrationSource.includes(requiredAccountSchemaFragment)) {
    throw new Error(`Verdun account migration is missing ${requiredAccountSchemaFragment}`)
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
