import { spawnSync } from 'node:child_process'

const sqlPath = process.argv[2] ?? '/tmp/verdun-newsletter-load.sql'
const snapshotPath = process.argv[3] ?? 'public/data/newsletter-snapshot.json'

const dryRun = spawnSync('node', [
  'scripts/apply-newsletter-sql.mjs',
  '--sql',
  sqlPath,
  '--snapshot',
  snapshotPath,
], { encoding: 'utf8' })
if (dryRun.error) throw dryRun.error
if (dryRun.status !== 0) {
  throw new Error(`database apply dry run failed\n${dryRun.stdout}\n${dryRun.stderr}`)
}
if (!dryRun.stdout.includes('dry run only')) {
  throw new Error('database apply dry run did not report that it skipped external Postgres')
}
if (!dryRun.stdout.includes('0001_newsletter.sql') || !dryRun.stdout.includes('0002_workbench_views.sql')) {
  throw new Error('database apply dry run did not include the newsletter and workbench migrations')
}

const missingDatabase = spawnSync('node', [
  'scripts/apply-newsletter-sql.mjs',
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
