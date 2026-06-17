import { spawnSync } from 'node:child_process'

const sqlPath = process.argv[2] ?? '/tmp/verdun-generic-load.sql'
const snapshotPath = process.argv[3] ?? 'public/data/newsletter-snapshot.json'

const dryRun = spawnSync('node', [
  'scripts/deploy-workbench-database.mjs',
  '--sql',
  sqlPath,
  '--snapshot',
  snapshotPath,
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

const missingDatabase = spawnSync('node', [
  'scripts/deploy-workbench-database.mjs',
  '--sql',
  sqlPath,
  '--snapshot',
  snapshotPath,
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
