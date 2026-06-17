import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runDeployDatabaseCli(process.argv.slice(2), process.env)
}

export async function runDeployDatabaseCli(args, env = process.env) {
  const apply = args.includes('--apply')
  const generate = !args.includes('--no-generate')
  const skipVercelEnv = args.includes('--skip-vercel-env')
  const skipDeployedCheck = args.includes('--skip-deployed-check')
  const requireReady = args.includes('--require-ready')
  const sqlPath = optionValue(args, '--sql') ?? env.NEWSLETTER_SQL_FILE ?? '/tmp/verdun-newsletter-load.sql'
  const snapshotPath = optionValue(args, '--snapshot') ?? env.NEWSLETTER_SNAPSHOT_FILE ?? 'public/data/newsletter-snapshot.json'
  const databaseUrl = optionValue(args, '--database-url') ?? env.POSTGRES_URL ?? env.DATABASE_URL ?? env.NEON_DATABASE_URL
  const baseUrl = optionValue(args, '--base-url') ?? env.VERDUN_DEPLOYED_URL

  if (generate) {
    run('cargo', [
      'run',
      '--manifest-path',
      'crawler/Cargo.toml',
      '--',
      'export-sql',
      '--snapshot',
      snapshotPath,
      '--out',
      sqlPath,
    ])
  } else {
    assertFile(sqlPath, 'SQL load file')
  }
  assertFile(snapshotPath, 'snapshot file')

  if (apply && !skipVercelEnv) assertVercelDatabaseEnv()

  run('node', [
    'scripts/instances/garbage/apply-newsletter-sql.mjs',
    '--sql',
    sqlPath,
    '--snapshot',
    snapshotPath,
    ...(databaseUrl ? ['--database-url', databaseUrl] : []),
    ...(apply ? ['--apply'] : []),
  ])

  if (apply && !skipDeployedCheck) {
    run('npm', [
      'run',
      'check:deployed',
      '--',
      ...(baseUrl ? [baseUrl] : []),
      '--require-database',
      ...(requireReady ? ['--require-ready'] : []),
    ])
  }

  console.log(apply
    ? 'database load applied and deployed database gate passed'
    : 'database deployment preflight passed (dry run only; add --apply to load external Postgres)')
}

function optionValue(args, name) {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function assertFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`)
}

function assertVercelDatabaseEnv() {
  const result = spawnSync('npx', ['vercel', 'env', 'ls', 'production'], {
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`could not inspect Vercel production env vars; run \`npx vercel env ls production\` from the linked project\n${result.stderr}`)
  }
  const output = `${result.stdout}\n${result.stderr}`
  const configuredName = ['POSTGRES_URL', 'DATABASE_URL', 'NEON_DATABASE_URL'].find((name) => output.includes(name))
  if (!configuredName) {
    throw new Error('Vercel production is missing POSTGRES_URL, DATABASE_URL, or NEON_DATABASE_URL. Add one with `npx vercel env add POSTGRES_URL production`, redeploy, then rerun this command.')
  }
  console.log(`verified Vercel production database env var: ${configuredName}`)
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} exited with ${result.status}`)
  }
}
