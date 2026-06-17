import { readFile } from 'node:fs/promises'
import { defaultDeployCheckProfileId, deployCheckProfile } from './instances/deploy-check-profiles.mjs'

const sqlPath = process.argv[2] ?? '/tmp/verdun-generic-load.sql'
const profile = deployCheckProfile(defaultDeployCheckProfileId())
const snapshotPath = process.argv[3] ?? profile?.sourceSnapshotPath ?? 'public/data/workbench-snapshot.json'

const [sql, snapshot] = await Promise.all([
  readFile(sqlPath, 'utf8'),
  readFile(snapshotPath, 'utf8').then((text) => JSON.parse(text)),
])

const items = snapshot.records ?? snapshot.items ?? []
const sourceRuns = snapshot.source_runs ?? snapshot.sourceRuns ?? []
const queryPlans = snapshot.collection_plans ?? snapshot.query_plans ?? snapshot.queryPlans ?? []
const snapshotGeneratedAt = snapshot.generated_at ?? snapshot.generatedAt
const defaultInstance = profile?.id ?? defaultDeployCheckProfileId()
const defaultBasePath = new URL(profile?.defaultBaseUrl ?? 'http://127.0.0.1/').pathname
const defaultRequiredSubjects = profile?.requiredSubjects ?? []
const defaultRequiredPlans = profile?.requiredPlans ?? defaultRequiredSubjects

assertCount('insert into records', items.length)
assertCount('insert into source_runs', sourceRuns.length)
assertCount('insert into collection_plans', queryPlans.length)

if (!sql.includes("insert into instances")) {
  throw new Error('generic SQL export is missing instance upsert')
}
const allowsCustomInstance = process.argv.includes('--allow-custom-instance')
if (!allowsCustomInstance && (!sql.includes(sqlString(defaultInstance)) || !sql.includes(sqlString(defaultBasePath)))) {
  throw new Error(`generic SQL export is missing default instance namespace: ${defaultInstance} at ${defaultBasePath}`)
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
if (!allowsCustomInstance) {
  for (const project of defaultRequiredSubjects) {
    if (!items.some((item) => subjectOf(item) === project)) throw new Error(`snapshot is missing required project ${project}`)
    if (!sql.includes(sqlString(project))) throw new Error(`generic SQL export is missing required subject ${project}`)
  }
  for (const project of defaultRequiredPlans) {
    if (!queryPlans.some((plan) => planSubject(plan) === project)) throw new Error(`snapshot is missing query plan for ${project}`)
  }
} else {
  for (const project of new Set(items.map(subjectOf))) {
    if (!sql.includes(sqlString(project))) throw new Error(`generic SQL export is missing custom subject ${project}`)
    if (!queryPlans.some((plan) => planSubject(plan) === project)) throw new Error(`snapshot is missing query plan for custom subject ${project}`)
  }
}
for (const item of representativeItems(items)) {
  if (!sql.includes(sqlString(item.id))) throw new Error(`generic SQL export is missing record id ${item.id}`)
  if (!sql.includes(sqlString(item.url))) throw new Error(`generic SQL export is missing URL for ${item.id}`)
  if (!sql.includes(sqlString(subjectOf(item)))) throw new Error(`generic SQL export is missing subject for ${item.id}`)
  const rawJson = item.raw_json ?? item.rawJson ?? {}
  if (rawJson.provenance && !sql.includes(sqlString(JSON.stringify(rawJson.provenance)))) {
    throw new Error(`generic SQL export is missing provenance JSON for ${item.id}`)
  }
}
for (const plan of representativeQueryPlans(queryPlans)) {
  const query = planQuery(plan)
  if (!sql.includes(sqlString(planSubject(plan)))) throw new Error(`generic SQL export is missing collection plan subject ${planSubject(plan)}`)
  if (!sql.includes(sqlString(query))) throw new Error(`generic SQL export is missing collection query for ${planSubject(plan)}`)
  if (!sql.includes(sqlTextArray(plan.live_terms ?? plan.liveTerms ?? []))) {
    throw new Error(`generic SQL export is missing live terms for ${planSubject(plan)}`)
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

function subjectOf(item) {
  return item.subject ?? item.project
}

function planSubject(plan) {
  return plan.subject ?? plan.project
}

function planQuery(plan) {
  return plan.query ?? plan.hacker_news_query ?? plan.hackerNewsQuery
}

function representativeItems(items) {
  const seen = new Set()
  return [
    items.find((item) => item.raw_json?.provenance),
    ...defaultRequiredSubjects.slice(0, 2).map((subject) => items.find((item) => subjectOf(item) === subject)),
    items[0],
    items[Math.floor(items.length / 2)],
  ].filter((item) => {
    if (!item || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function representativeQueryPlans(queryPlans) {
  const seen = new Set()
  return [
    ...defaultRequiredPlans.slice(0, 3).map((subject) => queryPlans.find((plan) => planSubject(plan) === subject)),
    queryPlans[0],
  ].filter((plan) => {
    if (!plan || seen.has(planSubject(plan))) return false
    seen.add(planSubject(plan))
    return true
  })
}
