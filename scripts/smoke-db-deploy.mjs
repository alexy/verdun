import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const sqlPath = process.argv[2] ?? '/tmp/verdun-generic-load.sql'
const snapshotPath = process.argv[3] ?? 'public/data/newsletter-snapshot.json'
const extraArgs = process.argv.slice(4)
const deploySource = readFileSync('scripts/deploy-workbench-database.mjs', 'utf8')

if (deploySource.includes('public/data/newsletter-snapshot.json')) {
  throw new Error('generic workbench deploy script still embeds the Garbage newsletter snapshot default')
}
if (deploySource.includes("!== 'garbage'") || deploySource.includes('!== "garbage"')) {
  throw new Error('generic workbench deploy script still special-cases Garbage by string literal')
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
], { encoding: 'utf8' })
if (dryRun.error) throw dryRun.error
if (dryRun.status !== 0) {
  throw new Error(`workbench database deployment dry run failed\n${dryRun.stdout}\n${dryRun.stderr}`)
}
if (!dryRun.stdout.includes('generic workbench database deployment preflight passed')) {
  throw new Error('workbench database deployment dry run did not report a preflight pass')
}
const instance = optionValue(extraArgs, '--instance')
if (instance && !dryRun.stdout.includes(`--instance ${instance}`)) {
  throw new Error(`workbench database deployment dry run did not preserve instance in deployed-check target\n${dryRun.stdout}`)
}
const basePath = optionValue(extraArgs, '--base-path')
if (basePath && !dryRun.stdout.includes(`--asset-base ${basePath}`)) {
  throw new Error(`workbench database deployment dry run did not preserve base path in deployed-check target\n${dryRun.stdout}`)
}
const staticSnapshot = optionValue(extraArgs, '--static-snapshot')
if (staticSnapshot && !dryRun.stdout.includes(`--static-snapshot ${staticSnapshot}`)) {
  throw new Error(`workbench database deployment dry run did not preserve static snapshot in deployed-check target\n${dryRun.stdout}`)
}

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
