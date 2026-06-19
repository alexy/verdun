import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const profile = deployCheckProfile(defaultDeployCheckProfileId())
const explicitSqlPath = process.argv[2]
const explicitSnapshotPath = process.argv[3]
const defaultGenericSmoke = profile?.genericSqlSmoke
const sqlPath = explicitSqlPath ?? defaultGenericSmoke?.sqlPath ?? '/tmp/verdun-generic-load.sql'
const snapshotPath = explicitSnapshotPath
  ?? profile?.sourceSnapshotPath
  ?? defaultGenericSmoke?.genericSnapshotPath
  ?? 'public/data/workbench-snapshot.json'
const applySource = readFileSync('scripts/workbench-apply-sql.mjs', 'utf8')
const smokeAllSource = readFileSync('scripts/smoke-all.mjs', 'utf8')
const smokeDbApplySource = readFileSync('scripts/smoke-db-apply.mjs', 'utf8')
const smokeDbDeploySource = readFileSync('scripts/smoke-db-deploy.mjs', 'utf8')
const genericLoaderSource = readFileSync('scripts/smoke-generic-loader-sql.mjs', 'utf8')
const smokeBrowserSource = readFileSync('scripts/smoke-browser.mjs', 'utf8')
const smokeResponsiveSource = readFileSync('../apps/garbage/scripts/smoke-responsive.mjs', 'utf8')
const smokeAppSource = readFileSync('../apps/garbage/scripts/smoke-app.mjs', 'utf8')
const coreMigrationSource = readFileSync('db/migrations/0003_generic_workbench_tables.sql', 'utf8')

if (applySource.includes('public/data/newsletter-snapshot.json')) {
  throw new Error('generic workbench apply script still embeds the Garbage newsletter snapshot default')
}
if (smokeAllSource.includes("const snapshotPath = 'public/data/newsletter-snapshot.json'")) {
  throw new Error('smoke-all still embeds the Garbage newsletter snapshot as its default source snapshot')
}
const embeddedSnapshotDefault = "?? 'public/data/" + "newsletter-snapshot.json'"
for (const [label, source] of [
  ['smoke-db-apply', smokeDbApplySource],
  ['smoke-db-deploy', smokeDbDeploySource],
]) {
  if (source.includes(embeddedSnapshotDefault)) {
    throw new Error(`${label} still embeds the Garbage newsletter snapshot as its default source snapshot`)
  }
}
for (const marker of ['public/data/newsletter-snapshot.json', "'garbage'", "'/rbage/'", 'Pydantic', 'LakeSail']) {
  if (genericLoaderSource.includes(marker)) {
    throw new Error(`generic loader smoke still embeds default Garbage marker: ${marker}`)
  }
}
for (const [label, source] of [
  ['smoke-browser', smokeBrowserSource],
  ['external-garbage-smoke-responsive', smokeResponsiveSource],
  ['external-garbage-smoke-app', smokeAppSource],
]) {
  if (source.includes('/rbage/')) {
    throw new Error(`${label} still embeds the Garbage preview base path instead of using profile metadata`)
  }
}
if (smokeBrowserSource.includes('smoke:app') || smokeBrowserSource.includes('smoke:responsive')) {
  throw new Error('smoke-browser should run UI checks from deploy-profile metadata instead of generic Garbage UI command names')
}
if (coreMigrationSource.includes('newsletter_') || coreMigrationSource.includes("'garbage'") || coreMigrationSource.includes('/rbage/')) {
  throw new Error('generic workbench migration still embeds Garbage newsletter compatibility')
}

if (!explicitSqlPath && !explicitSnapshotPath && defaultGenericSmoke?.genericSnapshotPath) {
  const collect = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'collect',
    '--instance',
    profile.id,
    '--out',
    defaultGenericSmoke.itemsPath,
    '--source-runs-out',
    defaultGenericSmoke.sourceRunsPath,
    '--public-out',
    defaultGenericSmoke.publicSnapshotPath,
    '--generic-out',
    defaultGenericSmoke.genericSnapshotPath,
    '--live',
  ], { encoding: 'utf8' })
  if (collect.error) throw collect.error
  if (collect.status !== 0) {
    throw new Error(`default ${profile.id} collection failed\n${collect.stdout}\n${collect.stderr}`)
  }
  const exportSql = spawnSync('cargo', [
    'run',
    '--manifest-path',
    'crawler/Cargo.toml',
    '--',
    'export-sql',
    '--target',
    'generic',
    '--instance',
    profile.id,
    '--snapshot',
    snapshotPath,
    '--out',
    sqlPath,
  ], { encoding: 'utf8' })
  if (exportSql.error) throw exportSql.error
  if (exportSql.status !== 0) {
    throw new Error(`default ${profile.id} SQL export failed\n${exportSql.stdout}\n${exportSql.stderr}`)
  }
}

const dryRun = spawnSync('node', [
  'scripts/workbench-apply-sql.mjs',
  '--sql',
  sqlPath,
  '--snapshot',
  snapshotPath,
], { encoding: 'utf8' })
if (dryRun.error) throw dryRun.error
if (dryRun.status !== 0) {
  throw new Error(`workbench database apply dry run failed\n${dryRun.stdout}\n${dryRun.stderr}`)
}
if (!dryRun.stdout.includes('dry run only')) {
  throw new Error('workbench database apply dry run did not report that it skipped external Postgres')
}
for (const migration of profile?.migrationPaths ?? ['db/migrations/0003_generic_workbench_tables.sql']) {
  if (!dryRun.stdout.includes(migration)) {
    throw new Error(`workbench database apply dry run did not include ${migration}`)
  }
}
if (!dryRun.stdout.includes('validated generic workbench SQL')) {
  throw new Error('workbench database apply dry run did not validate the generic workbench SQL contract')
}

const missingDatabase = spawnSync('node', [
  'scripts/workbench-apply-sql.mjs',
  '--sql',
  sqlPath,
  '--snapshot',
  snapshotPath,
  '--apply',
], {
  encoding: 'utf8',
  env: {
    ...process.env,
    POSTGRES_URL: '',
    DATABASE_URL: '',
    NEON_DATABASE_URL: '',
  },
})
if (missingDatabase.error) throw missingDatabase.error
if (missingDatabase.status === 0 || !missingDatabase.stderr.includes('external Postgres URL is required')) {
  throw new Error('database apply did not fail safely when --apply was used without a database URL')
}
