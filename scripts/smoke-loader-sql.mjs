import { readFile } from 'node:fs/promises'

const sqlPath = process.argv[2] ?? '/tmp/verdun-newsletter-load.sql'
const snapshotPath = process.argv[3] ?? 'public/data/newsletter-snapshot.json'

const [sql, snapshot] = await Promise.all([
  readFile(sqlPath, 'utf8'),
  readFile(snapshotPath, 'utf8').then((text) => JSON.parse(text)),
])

const itemCount = (snapshot.items ?? []).length
const sourceRunCount = (snapshot.source_runs ?? snapshot.sourceRuns ?? []).length
const items = snapshot.items ?? []
const sourceRuns = snapshot.source_runs ?? snapshot.sourceRuns ?? []
const queryPlans = snapshot.query_plans ?? snapshot.queryPlans ?? []
const itemInserts = countMatches(sql, 'insert into newsletter_items')
const sourceRunInserts = countMatches(sql, 'insert into newsletter_source_runs')
const queryPlanInserts = countMatches(sql, 'insert into newsletter_query_plans')

if (itemInserts !== itemCount) {
  throw new Error(`expected ${itemCount} newsletter_items inserts, found ${itemInserts}`)
}
if (sourceRunInserts !== sourceRunCount) {
  throw new Error(`expected ${sourceRunCount} newsletter_source_runs inserts, found ${sourceRunInserts}`)
}
if (queryPlanInserts !== queryPlans.length) {
  throw new Error(`expected ${queryPlans.length} newsletter_query_plans inserts, found ${queryPlanInserts}`)
}
for (const source of ['Hacker News', 'Medium', 'LinkedIn', 'X/Twitter']) {
  if (!sql.includes(sqlString(source))) throw new Error(`SQL export is missing source run for ${source}`)
}
for (const run of sourceRuns) {
  if (!sql.includes(sqlString(run.source))) throw new Error(`SQL export is missing source run row for ${run.source}`)
  if (!sql.includes(sqlString(JSON.stringify(run.project_counts ?? run.projectCounts ?? {})))) {
    throw new Error(`SQL export is missing project_counts payload for ${run.source}`)
  }
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
if (!sql.includes('on conflict (project) do update set')) {
  throw new Error('SQL export is missing query-plan upsert clause')
}
if (!sql.includes('focus_terms')) {
  throw new Error('SQL export is missing query-plan focus_terms column')
}
if (!sql.includes('review_targets')) {
  throw new Error('SQL export is missing query-plan review_targets column')
}

for (const project of ['Pydantic', 'LakeSail', 'Apache Arrow', 'DataFusion', 'Delta Lake', 'Turso', 'LanceDB', 'HelixDB', 'SurrealDB', 'pgGraph', 'Garde', 'zod-rs']) {
  if (!items.some((item) => item.project === project)) throw new Error(`snapshot is missing required project ${project}`)
  if (!sql.includes(sqlString(project))) throw new Error(`SQL export is missing required project ${project}`)
  if (!queryPlans.some((plan) => plan.project === project)) throw new Error(`snapshot is missing query plan for ${project}`)
}

for (const plan of representativeQueryPlans(queryPlans)) {
  if (!sql.includes(sqlString(plan.project))) throw new Error(`SQL export is missing query plan project ${plan.project}`)
  if (!sql.includes(sqlString(plan.hacker_news_query ?? plan.hackerNewsQuery))) {
    throw new Error(`SQL export is missing Hacker News query for ${plan.project}`)
  }
  if (!sql.includes(sqlTextArray(plan.live_terms ?? plan.liveTerms ?? []))) {
    throw new Error(`SQL export is missing live terms for ${plan.project}`)
  }
  if (!sql.includes(sqlTextArray(plan.dev_to_tags ?? plan.devToTags ?? []))) {
    throw new Error(`SQL export is missing dev.to tags for ${plan.project}`)
  }
  const reviewTargets = plan.review_targets ?? plan.reviewTargets ?? []
  if (!reviewTargets.length || !sql.includes(sqlString(JSON.stringify(reviewTargets)))) {
    throw new Error(`SQL export is missing review targets for ${plan.project}`)
  }
}

for (const item of representativeItems(items)) {
  if (!sql.includes(sqlString(item.id))) throw new Error(`SQL export is missing item id ${item.id}`)
  if (!sql.includes(sqlString(item.url))) throw new Error(`SQL export is missing URL for ${item.id}`)
  if (!sql.includes(sqlString(item.why_it_matters ?? item.whyItMatters))) {
    throw new Error(`SQL export is missing why_it_matters for ${item.id}`)
  }
  const tags = item.tags ?? []
  if (tags.length && !sql.includes(sqlTextArray(tags))) {
    throw new Error(`SQL export is missing tags for ${item.id}`)
  }
  const rawJson = item.raw_json ?? item.rawJson ?? {}
  if (rawJson.provenance && !sql.includes(sqlString(JSON.stringify(rawJson)))) {
    throw new Error(`SQL export is missing raw provenance JSON for ${item.id}`)
  }
}

function countMatches(value, pattern) {
  return value.split(pattern).length - 1
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlTextArray(values) {
  return `array[${values.map(sqlString).join(", ")}]`
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
