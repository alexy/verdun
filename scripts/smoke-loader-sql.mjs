import { readFile } from 'node:fs/promises'

const sqlPath = process.argv[2] ?? '/tmp/verdun-newsletter-load.sql'
const snapshotPath = process.argv[3] ?? 'public/data/newsletter-snapshot.json'

const [sql, snapshot] = await Promise.all([
  readFile(sqlPath, 'utf8'),
  readFile(snapshotPath, 'utf8').then((text) => JSON.parse(text)),
])

const itemCount = (snapshot.items ?? []).length
const sourceRunCount = (snapshot.source_runs ?? snapshot.sourceRuns ?? []).length
const itemInserts = countMatches(sql, 'insert into newsletter_items')
const sourceRunInserts = countMatches(sql, 'insert into newsletter_source_runs')

if (itemInserts !== itemCount) {
  throw new Error(`expected ${itemCount} newsletter_items inserts, found ${itemInserts}`)
}
if (sourceRunInserts !== sourceRunCount) {
  throw new Error(`expected ${sourceRunCount} newsletter_source_runs inserts, found ${sourceRunInserts}`)
}
for (const source of ['Hacker News', 'Medium', 'LinkedIn', 'X/Twitter']) {
  if (!sql.includes(sqlString(source))) throw new Error(`SQL export is missing source run for ${source}`)
}
if (!sql.includes('project_counts') || !sql.includes('"Pydantic"')) {
  throw new Error('SQL export is missing source-run project_counts JSON')
}
if (!sql.includes('on conflict (id) do update set')) {
  throw new Error('SQL export is missing item upsert clause')
}
if (!sql.includes('on conflict (source) do update set')) {
  throw new Error('SQL export is missing source-run upsert clause')
}

function countMatches(value, pattern) {
  return value.split(pattern).length - 1
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`
}
