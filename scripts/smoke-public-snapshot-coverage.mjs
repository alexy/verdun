import { readFile } from 'node:fs/promises'

const watchlist = await readFile('crawler/config/watchlist.toml', 'utf8')
const requiredProjects = projectNames(watchlist)
const snapshot = JSON.parse(await readFile('public/data/newsletter-snapshot.json', 'utf8'))
const items = snapshot.items ?? []
const sourceRuns = snapshot.source_runs ?? snapshot.sourceRuns ?? []
const projects = new Set(items.map((item) => item.project))
const missing = requiredProjects.filter((project) => !projects.has(project))
const extra = Array.from(projects).filter((project) => !requiredProjects.includes(project)).sort()
const queryPlans = Array.isArray(snapshot.query_plans) ? snapshot.query_plans : []
const queryPlanProjects = new Set(queryPlans.map((plan) => plan.project))
const missingQueryPlans = requiredProjects.filter((project) => !queryPlanProjects.has(project))
const extraQueryPlans = Array.from(queryPlanProjects).filter((project) => !requiredProjects.includes(project)).sort()

if (missing.length) {
  throw new Error(`public snapshot is missing watchlist projects: ${missing.join(', ')}`)
}

if (extra.length) {
  throw new Error(`public snapshot has projects outside the watchlist: ${extra.join(', ')}`)
}

if (missingQueryPlans.length) {
  throw new Error(`public snapshot is missing query plans: ${missingQueryPlans.join(', ')}`)
}

if (extraQueryPlans.length) {
  throw new Error(`public snapshot has query plans outside the watchlist: ${extraQueryPlans.join(', ')}`)
}

for (const plan of queryPlans) {
  if (!plan.project || !plan.hacker_news_query) {
    throw new Error('public snapshot has an incomplete query plan')
  }
  if (!Array.isArray(plan.live_terms) || !plan.live_terms.length) {
    throw new Error(`${plan.project} query plan has no distinctive live terms`)
  }
  if (!Array.isArray(plan.dev_to_tags) || !plan.dev_to_tags.length) {
    throw new Error(`${plan.project} query plan has no dev.to tags`)
  }
  if (!Array.isArray(plan.review_targets) || !plan.review_targets.length) {
    throw new Error(`${plan.project} query plan has no review targets`)
  }
}

const baml = queryPlans.find((plan) => plan.project === 'BAML')
if (baml?.live_terms.includes('schema')) {
  throw new Error('BAML public snapshot query plan leaked generic schema keyword')
}

const substackRun = sourceRuns.find((run) => run.source === 'Substack')
if (!substackRun || substackRun.status !== 'ok' || Number(substackRun.item_count ?? substackRun.itemCount) <= 0) {
  throw new Error('public snapshot should include live Substack source coverage')
}
if (!items.some((item) => item.source === 'Substack')) {
  throw new Error('public snapshot is missing Substack items')
}

const ibis = queryPlans.find((plan) => plan.project === 'Ibis')
if (!ibis?.live_terms.includes('ibis')) {
  throw new Error('Ibis public snapshot query plan lost the project name')
}

const pydantic = queryPlans.find((plan) => plan.project === 'Pydantic')
for (const source of ['Hacker News', 'Substack', 'LinkedIn', 'X/Twitter']) {
  if (!pydantic?.review_targets?.some((target) => target.source === source && target.url?.startsWith('https://'))) {
    throw new Error(`Pydantic public snapshot query plan is missing ${source} review target`)
  }
}

function projectNames(toml) {
  return toml
    .split(/\n\[\[projects]]\n/g)
    .slice(1)
    .map((block) => block.match(/^name\s*=\s*"([^"]+)"/m)?.[1])
    .filter(Boolean)
}
