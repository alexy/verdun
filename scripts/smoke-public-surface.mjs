import { access, readFile } from 'node:fs/promises'

const expectedExports = {
  './api/public/http': './api/public/http.ts',
  './api/public/workbench-local-adapter': './api/public/workbench-local-adapter.ts',
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

for (const forbidden of ['verdun/src/core/', 'verdun/api/core/', 'verdun/db/core/', 'verdun/scripts/core/']) {
  if (!documentedSurface.includes(forbidden)) {
    throw new Error(`PUBLIC_SURFACE.md should explicitly tell apps not to import ${forbidden}`)
  }
}

if (!documentedSurface.includes('verdun_crawler::sdk')) {
  throw new Error('PUBLIC_SURFACE.md does not document the Rust crawler SDK facade')
}

const { validateDeployCheckProfile } = await import('./public/deploy-profile-contract.mjs')
validateDeployCheckProfile({
  id: 'surface-smoke',
  basePath: '/surface-smoke/',
  defaultBaseUrl: 'https://example.com/surface-smoke/',
  staticSnapshotPath: 'data/surface-smoke.json',
}, 'public-surface smoke profile')

try {
  validateDeployCheckProfile({ id: 'bad-profile', basePath: 'bad' }, 'bad public-surface smoke profile')
  throw new Error('deploy profile contract accepted an invalid basePath')
} catch (error) {
  if (!String(error?.message ?? error).includes('basePath')) throw error
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
