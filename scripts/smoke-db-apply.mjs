import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const sqlPath = process.argv[2] ?? '/tmp/verdun-generic-load.sql'
const snapshotPath = process.argv[3] ?? 'public/data/newsletter-snapshot.json'
const applySource = readFileSync('scripts/workbench-apply-sql.mjs', 'utf8')
const smokeAllSource = readFileSync('scripts/smoke-all.mjs', 'utf8')
const genericLoaderSource = readFileSync('scripts/smoke-generic-loader-sql.mjs', 'utf8')
const smokeBrowserSource = readFileSync('scripts/smoke-browser.mjs', 'utf8')
const smokeResponsiveSource = readFileSync('scripts/smoke-responsive.mjs', 'utf8')
const smokeAppSource = readFileSync('scripts/smoke-app.mjs', 'utf8')

if (applySource.includes('public/data/newsletter-snapshot.json')) {
  throw new Error('generic workbench apply script still embeds the Garbage newsletter snapshot default')
}
if (smokeAllSource.includes("const snapshotPath = 'public/data/newsletter-snapshot.json'")) {
  throw new Error('smoke-all still embeds the Garbage newsletter snapshot as its default source snapshot')
}
for (const marker of ['public/data/newsletter-snapshot.json', "'garbage'", "'/rbage/'", 'Pydantic', 'LakeSail']) {
  if (genericLoaderSource.includes(marker)) {
    throw new Error(`generic loader smoke still embeds default Garbage marker: ${marker}`)
  }
}
for (const [label, source] of [
  ['smoke-browser', smokeBrowserSource],
  ['smoke-responsive', smokeResponsiveSource],
  ['smoke-app', smokeAppSource],
]) {
  if (source.includes('/rbage/')) {
    throw new Error(`${label} still embeds the Garbage preview base path instead of using profile metadata`)
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
for (const migration of ['0001_newsletter.sql', '0002_workbench_views.sql', '0003_generic_workbench_tables.sql']) {
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
