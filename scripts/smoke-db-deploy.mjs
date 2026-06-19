import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
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
const extraArgs = process.argv.slice(4)
const handoffPath = `/tmp/verdun-db-handoff-${Date.now()}.json`
const deploySource = readFileSync('scripts/deploy-workbench-database.mjs', 'utf8')

if (deploySource.includes('public/data/newsletter-snapshot.json')) {
  throw new Error('generic workbench deploy script still embeds the Garbage newsletter snapshot default')
}
if (deploySource.includes("!== 'garbage'") || deploySource.includes('!== "garbage"')) {
  throw new Error('generic workbench deploy script still special-cases Garbage by string literal')
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
  'scripts/deploy-workbench-database.mjs',
  '--sql',
  sqlPath,
  '--snapshot',
  snapshotPath,
  ...extraArgs,
  '--no-generate',
  '--skip-vercel-env',
  '--skip-deployed-check',
  '--handoff-out',
  handoffPath,
], { encoding: 'utf8' })
if (dryRun.error) throw dryRun.error
if (dryRun.status !== 0) {
  throw new Error(`workbench database deployment dry run failed\n${dryRun.stdout}\n${dryRun.stderr}`)
}
if (!dryRun.stdout.includes('generic workbench database deployment preflight passed')) {
  throw new Error('workbench database deployment dry run did not report a preflight pass')
}
if (!dryRun.stdout.includes(`wrote generic workbench database handoff ${handoffPath}`)) {
  throw new Error(`workbench database deployment dry run did not report handoff output\n${dryRun.stdout}`)
}
if (!existsSync(handoffPath)) {
  throw new Error(`workbench database handoff was not written: ${handoffPath}`)
}
const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'))
if (handoff.kind !== 'verdun_generic_workbench_database_reload' || handoff.status !== 'preflight') {
  throw new Error(`unexpected workbench handoff identity/status: ${JSON.stringify(handoff)}`)
}
if (handoff.snapshotPath !== snapshotPath || handoff.sqlPath !== sqlPath) {
  throw new Error(`workbench handoff did not preserve snapshot/sql paths: ${JSON.stringify(handoff)}`)
}
if (handoff.databaseEnv !== 'not_provided' || JSON.stringify(handoff).includes('postgres://')) {
  throw new Error('workbench handoff should record database env presence without leaking database URLs')
}
const instance = optionValue(extraArgs, '--instance')
if (instance && !dryRun.stdout.includes(`--instance ${instance}`)) {
  throw new Error(`workbench database deployment dry run did not preserve instance in deployed-check target\n${dryRun.stdout}`)
}
if (instance && handoff.instance !== instance) {
  throw new Error(`workbench handoff did not preserve instance ${instance}: ${JSON.stringify(handoff)}`)
}
if (
  instance
  && instance !== defaultDeployCheckProfileId()
  && (
    dryRun.stdout.includes('db/instances/garbage/migrations')
    || dryRun.stdout.includes('apps/garbage/db/instances/garbage/migrations')
  )
) {
  throw new Error(`non-default workbench deployment dry run should not include Garbage migrations\n${dryRun.stdout}`)
}
const instanceProfile = deployCheckProfile(instance)
const basePath = optionValue(extraArgs, '--base-path') ?? instanceProfile?.basePath
if (basePath && !dryRun.stdout.includes(`--asset-base ${basePath}`)) {
  throw new Error(`workbench database deployment dry run did not preserve base path in deployed-check target\n${dryRun.stdout}`)
}
if (basePath && handoff.basePath !== basePath) {
  throw new Error(`workbench handoff did not preserve base path ${basePath}: ${JSON.stringify(handoff)}`)
}
const staticSnapshot = optionValue(extraArgs, '--static-snapshot') ?? instanceProfile?.staticSnapshotPath
if (staticSnapshot && !dryRun.stdout.includes(`--static-snapshot ${staticSnapshot}`)) {
  throw new Error(`workbench database deployment dry run did not preserve static snapshot in deployed-check target\n${dryRun.stdout}`)
}
if (staticSnapshot && handoff.staticSnapshotPath !== staticSnapshot) {
  throw new Error(`workbench handoff did not preserve static snapshot ${staticSnapshot}: ${JSON.stringify(handoff)}`)
}
rmSync(handoffPath, { force: true })

const missingDatabase = spawnSync('node', [
  'scripts/deploy-workbench-database.mjs',
  '--sql',
  sqlPath,
  '--snapshot',
  snapshotPath,
  ...extraArgs,
  '--no-generate',
  '--skip-vercel-env',
  '--skip-deployed-check',
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
  throw new Error('workbench database deployment command did not fail safely when --apply was used without a database URL')
}

function optionValue(args, name) {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}
