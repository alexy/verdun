import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const sqlPath = optionValue('--sql') ?? process.env.NEWSLETTER_SQL_FILE ?? '/tmp/verdun-newsletter-load.sql'
const snapshotPath = optionValue('--snapshot') ?? process.env.NEWSLETTER_SNAPSHOT_FILE ?? 'public/data/newsletter-snapshot.json'
const explicitMigrationPath = optionValue('--migration') ?? process.env.NEWSLETTER_MIGRATION_FILE
const migrationPaths = explicitMigrationPath ? [explicitMigrationPath] : defaultMigrationPaths()
const databaseUrl = optionValue('--database-url') ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL

assertFile(sqlPath, 'SQL load file')
assertFile(snapshotPath, 'snapshot file')
for (const migrationPath of migrationPaths) assertFile(migrationPath, 'migration file')

run('node', ['scripts/smoke-loader-sql.mjs', sqlPath, snapshotPath])
console.log(`migrations ready: ${migrationPaths.join(', ')}`)

if (!apply) {
  console.log(`validated ${sqlPath} against ${snapshotPath}`)
  console.log('dry run only; pass --apply with POSTGRES_URL, DATABASE_URL, or NEON_DATABASE_URL to load external Postgres')
  process.exit(0)
}

if (!databaseUrl) {
  throw new Error('external Postgres URL is required; set POSTGRES_URL, DATABASE_URL, NEON_DATABASE_URL, or pass --database-url')
}

for (const migrationPath of migrationPaths) {
  runPsql(databaseUrl, migrationPath, 'migration')
}
runPsql(databaseUrl, sqlPath, 'newsletter SQL load')
console.log(`applied ${sqlPath} to external Postgres after validating ${snapshotPath}`)

function optionValue(name) {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function assertFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`)
}

function defaultMigrationPaths() {
  const migrationDir = 'db/migrations'
  return readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => join(migrationDir, name))
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} exited with ${result.status}`)
  }
}

function runPsql(url, file, label) {
  console.log(`applying ${label} from ${file}`)
  const result = spawnSync('psql', [url, '--set', 'ON_ERROR_STOP=1', '--file', file], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`psql failed while applying ${label}`)
}
