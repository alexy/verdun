import { readFile } from 'node:fs/promises'

const sqlPath = process.argv[2] ?? '/tmp/verdun-generic-load.sql'
const snapshotPath = process.argv[3] ?? 'public/data/newsletter-snapshot.json'

const [sql, snapshot] = await Promise.all([
  readFile(sqlPath, 'utf8'),
  readFile(snapshotPath, 'utf8').then((text) => JSON.parse(text)),
])

const items = snapshot.items ?? []
const sourceRuns = snapshot.source_runs ?? snapshot.sourceRuns ?? []
const queryPlans = snapshot.query_plans ?? snapshot.queryPlans ?? []
const snapshotGeneratedAt = snapshot.generated_at ?? snapshot.generatedAt

assertCount('insert into records', items.length)
assertCount('insert into source_runs', sourceRuns.length)
assertCount('insert into collection_plans', queryPlans.length)

if (!sql.includes("insert into instances")) {
  throw new Error('generic SQL export is missing instance upsert')
}
const allowsCustomInstance = process.argv.includes('--allow-custom-instance')
if (!allowsCustomInstance && (!sql.includes("'garbage'") || !sql.includes("'/rbage/'"))) {
  throw new Error('generic SQL export is missing Garbage instance namespace')
}
if (allowsCustomInstance) {
  const instance = valueAfter('--expect-instance')
  const basePath = valueAfter('--expect-base-path')
  if (instance && !sql.includes(sqlString(instance))) {
    throw new Error(`generic SQL export is missing custom instance ${instance}`)
  }
  if (basePath && !sql.includes(sqlString(basePath))) {
    throw new Error(`generic SQL export is missing custom base path ${basePath}`)
  }
}
for (const table of ['records', 'source_runs', 'collection_plans']) {
  if (!sql.includes(`on conflict (instance, ${table === 'records' ? 'id' : table === 'source_runs' ? 'source' : 'subject'}) do update set`)) {
    throw new Error(`generic SQL export is missing ${table} upsert clause`)
  }
}
if (sourceRuns.length) {
  if (!snapshotGeneratedAt) throw new Error('snapshot is missing generated_at')
  if (!hasSnapshotCollectedAt(sql, snapshotGeneratedAt)) {
    throw new Error('generic SQL export is missing snapshot generated_at for source-run collected_at')
  }
}
for (const required of ['provenance_json', 'normalized_json', 'raw_json', 'dedupe_key', 'subject_counts']) {
  if (!sql.includes(required)) throw new Error(`generic SQL export is missing ${required}`)
}
for (const project of ['Pydantic', 'LakeSail', 'Apache Arrow', 'DataFusion', 'Delta Lake', 'Turso', 'LanceDB', 'HelixDB', 'SurrealDB', 'pgGraph', 'Garde', 'zod-rs']) {
  if (!items.some((item) => item.project === project)) throw new Error(`snapshot is missing required project ${project}`)
  if (!sql.includes(sqlString(project))) throw new Error(`generic SQL export is missing required subject ${project}`)
  if (!queryPlans.some((plan) => plan.project === project)) throw new Error(`snapshot is missing query plan for ${project}`)
}
for (const item of representativeItems(items)) {
  if (!sql.includes(sqlString(item.id))) throw new Error(`generic SQL export is missing record id ${item.id}`)
  if (!sql.includes(sqlString(item.url))) throw new Error(`generic SQL export is missing URL for ${item.id}`)
  if (!sql.includes(sqlString(item.project))) throw new Error(`generic SQL export is missing subject for ${item.id}`)
  const rawJson = item.raw_json ?? item.rawJson ?? {}
  if (rawJson.provenance && !sql.includes(sqlString(JSON.stringify(rawJson.provenance)))) {
    throw new Error(`generic SQL export is missing provenance JSON for ${item.id}`)
  }
}
for (const plan of representativeQueryPlans(queryPlans)) {
  const query = plan.hacker_news_query ?? plan.hackerNewsQuery
  if (!sql.includes(sqlString(plan.project))) throw new Error(`generic SQL export is missing collection plan subject ${plan.project}`)
  if (!sql.includes(sqlString(query))) throw new Error(`generic SQL export is missing collection query for ${plan.project}`)
  if (!sql.includes(sqlTextArray(plan.live_terms ?? plan.liveTerms ?? []))) {
    throw new Error(`generic SQL export is missing live terms for ${plan.project}`)
  }
}

function assertCount(pattern, expected) {
  const actual = sql.split(pattern).length - 1
  if (actual !== expected) throw new Error(`expected ${expected} ${pattern} statements, found ${actual}`)
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlTextArray(values) {
  return `array[${values.map(sqlString).join(", ")}]`
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasSnapshotCollectedAt(sql, snapshotGeneratedAt) {
  const candidates = new Set([
    snapshotGeneratedAt,
    snapshotGeneratedAt.replace(/Z$/, '+00:00'),
    new Date(snapshotGeneratedAt).toISOString(),
    new Date(snapshotGeneratedAt).toISOString().replace(/Z$/, '+00:00'),
  ])
  return [...candidates].some((candidate) => sql.includes(`${sqlString(candidate)}::timestamptz`))
}

function representativeItems(items) {
  const seen = new Set()
  return [
    items.find((item) => item.raw_json?.provenance),
    items.find((item) => item.source === 'Hacker News'),
    items.find((item) => item.project === 'Pydantic'),
    items.find((item) => item.project === 'LakeSail'),
    items[0],
  ].filter((item) => {
    if (!item || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function representativeQueryPlans(queryPlans) {
  const seen = new Set()
  return [
    queryPlans.find((plan) => plan.project === 'Pydantic'),
    queryPlans.find((plan) => plan.project === 'LakeSail'),
    queryPlans.find((plan) => plan.project === 'Grust Sail'),
    queryPlans[0],
  ].filter((plan) => {
    if (!plan || seen.has(plan.project)) return false
    seen.add(plan.project)
    return true
  })
}
