import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runApplyWorkbenchSqlCli(process.argv.slice(2), process.env)
}

export async function runApplyWorkbenchSqlCli(args, env = process.env) {
  const apply = args.includes('--apply')
  const sqlPath = optionValue(args, '--sql') ?? env.WORKBENCH_SQL_FILE ?? env.VERDUN_SQL_FILE ?? '/tmp/verdun-workbench-load.sql'
  const snapshotPath = optionValue(args, '--snapshot') ?? env.WORKBENCH_SNAPSHOT_FILE ?? env.VERDUN_SNAPSHOT_FILE ?? 'public/data/newsletter-snapshot.json'
  const explicitMigrationPath = optionValue(args, '--migration') ?? env.WORKBENCH_MIGRATION_FILE ?? env.VERDUN_MIGRATION_FILE
  const migrationPaths = explicitMigrationPath ? [explicitMigrationPath] : defaultMigrationPaths()
  const databaseUrl = optionValue(args, '--database-url') ?? env.POSTGRES_URL ?? env.DATABASE_URL ?? env.NEON_DATABASE_URL
  const loaderArgs = [
    sqlPath,
    snapshotPath,
    ...optionalValue(args, '--allow-custom-instance'),
    ...optionalPair(args, '--expect-instance'),
    ...optionalPair(args, '--expect-base-path'),
  ]

  assertFile(sqlPath, 'SQL load file')
  assertFile(snapshotPath, 'snapshot file')
  for (const migrationPath of migrationPaths) assertFile(migrationPath, 'migration file')

  run('node', ['scripts/smoke-generic-loader-sql.mjs', ...loaderArgs])
  console.log(`migrations ready: ${migrationPaths.join(', ')}`)

  if (!apply) {
    console.log(`validated generic workbench SQL ${sqlPath} against ${snapshotPath}`)
    console.log('dry run only; pass --apply with POSTGRES_URL, DATABASE_URL, or NEON_DATABASE_URL to load external Postgres')
    return
  }

  if (!databaseUrl) {
    throw new Error('external Postgres URL is required; set POSTGRES_URL, DATABASE_URL, NEON_DATABASE_URL, or pass --database-url')
  }

  for (const migrationPath of migrationPaths) {
    runPsql(databaseUrl, migrationPath, 'migration')
  }
  runPsql(databaseUrl, sqlPath, 'generic workbench SQL load')
  console.log(`applied generic workbench SQL ${sqlPath} to external Postgres after validating ${snapshotPath}`)
}

function optionValue(args, name) {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function optionalValue(args, name) {
  return args.includes(name) ? [name] : []
}

function optionalPair(args, name) {
  const value = optionValue(args, name)
  return value ? [name, value] : []
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
